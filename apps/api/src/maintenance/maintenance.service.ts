import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import {
  CreateMaintenanceJobDto,
  CreateMaintenanceScheduleDto,
  UpdateMaintenanceJobDto,
} from './dto/maintenance-job.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createJob(dto: CreateMaintenanceJobDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Maintenance jobs can only be created within a tenant context');

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

  async list(query: PaginationQueryDto & { machineId?: string; status?: string }) {
    const where = {
      ...(query.machineId ? { machineId: query.machineId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
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
    return job;
  }

  async update(id: string, dto: UpdateMaintenanceJobDto) {
    const existing = await this.getById(id);

    const [updated] = await this.prisma.db.$transaction([
      this.prisma.db.maintenanceJob.update({
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
      }),
      ...(dto.status === 'COMPLETED'
        ? [this.prisma.db.machine.update({ where: { id: existing.machineId }, data: { status: 'RUNNING' as const } })]
        : []),
    ]);

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
    return this.prisma.db.maintenanceSchedule.findMany({
      include: { machine: { select: { id: true, name: true, machineCode: true } } },
      orderBy: { nextDueAt: 'asc' },
    });
  }

  /** Machines whose preventive maintenance is due within the next 7 days — feeds the Maintenance Dashboard (SRS §12.6). */
  async listDueSoon() {
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return this.prisma.db.maintenanceSchedule.findMany({
      where: { nextDueAt: { lte: in7Days } },
      include: { machine: { select: { id: true, name: true, machineCode: true } } },
      orderBy: { nextDueAt: 'asc' },
    });
  }
}
