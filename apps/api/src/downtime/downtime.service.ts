import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess } from '../common/factory-access.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CloseDowntimeDto, CreateDowntimeDto, DowntimeCategoryDto } from './dto/downtime.dto';

/** Categories that represent an actual machine breakdown, per SRS §9.3 ("a maintenance job is created automatically when a machine breaks down"). */
const BREAKDOWN_CATEGORIES = new Set([DowntimeCategoryDto.MECHANICAL, DowntimeCategoryDto.ELECTRICAL]);

@Injectable()
export class DowntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateDowntimeDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Downtime can only be recorded within a tenant context');

    const machine = await this.prisma.db.machine.findUnique({ where: { id: dto.machineId } });
    if (!machine) throw new NotFoundException('Machine not found');
    assertFactoryAccess(ctx, machine.factoryId);

    const isBreakdown = BREAKDOWN_CATEGORIES.has(dto.category);

    const [downtime] = await this.prisma.db.$transaction([
      this.prisma.db.downtime.create({
        data: {
          tenantId: ctx.tenantId,
          machineId: dto.machineId,
          departmentId: dto.departmentId,
          operatorId: dto.operatorId,
          startTime: new Date(dto.startTime),
          category: dto.category,
          reason: dto.reason,
          notes: dto.notes,
        },
      }),
      this.prisma.db.machine.update({
        where: { id: dto.machineId },
        data: { status: isBreakdown ? 'BREAKDOWN' : 'IDLE' },
      }),
    ]);

    if (isBreakdown) {
      const jobNumber = `MJ-${String((await this.prisma.db.maintenanceJob.count()) + 1).padStart(6, '0')}`;
      await this.prisma.db.maintenanceJob.create({
        data: {
          tenantId: ctx.tenantId,
          factoryId: machine.factoryId,
          jobNumber,
          machineId: dto.machineId,
          type: 'CORRECTIVE',
          downtimeId: downtime.id,
          status: 'OPEN',
          notes: `Auto-created from downtime (${dto.category}): ${dto.reason ?? 'no reason given'}`,
        },
      });
    }

    await this.auditService.log({ action: 'CREATE', entityType: 'Downtime', entityId: downtime.id, newValue: dto });
    return downtime;
  }

  /**
   * P1 remediation (WF-017): closing a downtime record no longer
   * unconditionally marks the machine RUNNING — it now checks whether the
   * corrective `MaintenanceJob` this downtime auto-created (or any other
   * open job against the same machine) is still open, and leaves the
   * machine's status alone if so. Previously a supervisor closing a routine
   * downtime record could mark a machine available for production while its
   * actual mechanical/electrical fault was still an open maintenance job.
   */
  async close(id: string, dto: CloseDowntimeDto) {
    const existing = await this.getById(id);
    const endTime = new Date(dto.endTime);
    const durationMinutes = Math.max(0, Math.round((endTime.getTime() - existing.startTime.getTime()) / 60000));

    const [updated] = await this.prisma.db.$transaction(async (tx) => {
      const updatedDowntime = await tx.downtime.update({ where: { id }, data: { endTime, durationMinutes } });

      const openJobs = await tx.maintenanceJob.count({
        where: { machineId: existing.machineId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      });
      if (openJobs === 0) {
        await tx.machine.update({ where: { id: existing.machineId }, data: { status: 'RUNNING' } });
      }

      return [updatedDowntime];
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Downtime',
      entityId: id,
      newValue: { endTime, durationMinutes },
    });
    return updated;
  }

  async list(query: PaginationQueryDto & { machineId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    const where = {
      ...(query.machineId ? { machineId: query.machineId } : {}),
      ...(ctx.factoryIds.length > 0 ? { machine: { factoryId: { in: ctx.factoryIds } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.downtime.findMany({
        where,
        include: { machine: { select: { id: true, name: true, machineCode: true } } },
        skip: query.skip,
        take: query.take,
        orderBy: { startTime: 'desc' },
      }),
      this.prisma.db.downtime.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const downtime = await this.prisma.db.downtime.findUnique({
      where: { id },
      include: { machine: true, maintenanceJobs: true },
    });
    if (!downtime) throw new NotFoundException('Downtime record not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), downtime.machine.factoryId);
    return downtime;
  }
}
