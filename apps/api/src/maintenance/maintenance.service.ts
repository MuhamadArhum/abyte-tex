import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { assertValidTransition } from '../common/workflow.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import {
  CreateMaintenanceJobDto,
  CreateMaintenanceScheduleDto,
  MaintenanceJobStatus,
  UpdateMaintenanceJobDto,
} from './dto/maintenance-job.dto';

/** P1 remediation (WF-017): explicit transition map per SRS §9.3. */
const MAINTENANCE_JOB_TRANSITIONS: Partial<Record<MaintenanceJobStatus, readonly MaintenanceJobStatus[]>> = {
  OPEN: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
};

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createJob(dto: CreateMaintenanceJobDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Maintenance jobs can only be created within a tenant context');

    assertFactoryAccess(ctx, dto.factoryId);
    const machine = await this.prisma.db.machine.findUnique({ where: { id: dto.machineId } });
    if (!machine) throw new NotFoundException('Machine not found');

    const jobNumber = `MJ-${String((await this.prisma.db.maintenanceJob.count()) + 1).padStart(6, '0')}`;
    const job = await this.prisma.db.maintenanceJob.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: dto.factoryId,
        jobNumber,
        machineId: dto.machineId,
        type: 'PREVENTIVE',
        scheduleId: dto.scheduleId,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        technicianId: dto.technicianId,
        notes: dto.notes,
      },
    });
    await this.auditService.log({
      action: 'CREATE',
      entityType: 'MaintenanceJob',
      entityId: job.id,
      newValue: { jobNumber },
    });
    return job;
  }

  async list(query: PaginationQueryDto & { machineId?: string; status?: string; factoryId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = {
      ...(query.machineId ? { machineId: query.machineId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...factoryScopeFilter(ctx, query.factoryId),
    };
    const [items, total] = await Promise.all([
      this.prisma.db.maintenanceJob.findMany({
        where,
        include: {
          machine: { select: { id: true, name: true, machineCode: true } },
          technician: { select: { id: true, firstName: true, lastName: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.maintenanceJob.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const job = await this.prisma.db.maintenanceJob.findUnique({
      where: { id },
      include: { machine: true, technician: true, downtime: true },
    });
    if (!job) throw new NotFoundException('Maintenance job not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), job.factoryId);
    return job;
  }

  /**
   * P1 remediation (WF-017): status changes are validated against
   * `MAINTENANCE_JOB_TRANSITIONS` — OPEN -> COMPLETED skipping IN_PROGRESS
   * is still allowed (a quick fix doesn't always need a distinct "in
   * progress" window), but COMPLETED/CANCELLED are terminal, closing the
   * "reopen a completed job" gap. Setting the machine back to RUNNING on
   * completion now checks for *other* still-open jobs against the same
   * machine first — completing one of two concurrent jobs no longer
   * incorrectly marks the machine available. `DowntimeService.close()` has
   * the matching half of this fix for the downtime-closes-before-job-done
   * case (see that file).
   *
   * P1 remediation (WF-018): completing a PREVENTIVE job linked to a
   * schedule (`scheduleId`) now advances that schedule's `lastPerformedAt`/
   * `nextDueAt` — previously nothing ever wrote to either field after
   * creation, so a schedule stayed frozen at its first due date forever.
   */
  async update(id: string, dto: UpdateMaintenanceJobDto) {
    const existing = await this.getById(id);
    if (dto.status) {
      assertValidTransition('Maintenance Job', existing.status, dto.status, MAINTENANCE_JOB_TRANSITIONS);
    }

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const updatedJob = await tx.maintenanceJob.update({
        where: { id },
        data: {
          status: dto.status,
          startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
          completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
          technicianId: dto.technicianId,
          sparePartsUsed: dto.sparePartsUsed,
          cost: dto.cost,
          notes: dto.notes,
        },
      });

      if (dto.status === 'COMPLETED') {
        const otherOpenJobs = await tx.maintenanceJob.count({
          where: { machineId: existing.machineId, id: { not: id }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        });
        if (otherOpenJobs === 0) {
          await tx.machine.update({ where: { id: existing.machineId }, data: { status: 'RUNNING' } });
        }

        if (existing.scheduleId) {
          const schedule = await tx.maintenanceSchedule.findUnique({ where: { id: existing.scheduleId } });
          if (schedule) {
            const now = new Date();
            await tx.maintenanceSchedule.update({
              where: { id: existing.scheduleId },
              data: {
                lastPerformedAt: now,
                nextDueAt: new Date(now.getTime() + schedule.frequencyDays * 24 * 60 * 60 * 1000),
              },
            });
          }
        }
      }

      return updatedJob;
    });

    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'MaintenanceJob',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: dto,
    });
    return updated;
  }

  // ---------------------------------------------------------------- Preventive schedules

  async createSchedule(dto: CreateMaintenanceScheduleDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Schedules can only be created within a tenant context');

    const machine = await this.prisma.db.machine.findUnique({ where: { id: dto.machineId } });
    if (!machine) throw new NotFoundException('Machine not found');
    assertFactoryAccess(ctx, machine.factoryId);

    const nextDueAt = new Date(Date.now() + dto.frequencyDays * 24 * 60 * 60 * 1000);
    return this.prisma.db.maintenanceSchedule.create({
      data: {
        tenantId: ctx.tenantId,
        machineId: dto.machineId,
        frequencyDays: dto.frequencyDays,
        notes: dto.notes,
        nextDueAt,
      },
    });
  }

  async listSchedules() {
    const ctx = TenantContextStore.getOrThrow();
    return this.prisma.db.maintenanceSchedule.findMany({
      where: ctx.factoryIds.length > 0 ? { machine: { factoryId: { in: ctx.factoryIds } } } : {},
      include: { machine: { select: { id: true, name: true, machineCode: true } } },
      orderBy: { nextDueAt: 'asc' },
    });
  }

  /** Machines whose preventive maintenance is due within the next 7 days — feeds the Maintenance Dashboard (SRS §12.6). */
  async listDueSoon() {
    const ctx = TenantContextStore.getOrThrow();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return this.prisma.db.maintenanceSchedule.findMany({
      where: {
        nextDueAt: { lte: in7Days },
        ...(ctx.factoryIds.length > 0 ? { machine: { factoryId: { in: ctx.factoryIds } } } : {}),
      },
      include: { machine: { select: { id: true, name: true, machineCode: true } } },
      orderBy: { nextDueAt: 'asc' },
    });
  }
}
