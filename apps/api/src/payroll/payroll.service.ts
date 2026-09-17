import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { AddPayrollEntryDto, CreatePayrollPeriodDto, UpdatePayrollPeriodStatusDto } from './dto/payroll.dto';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createPeriod(dto: CreatePayrollPeriodDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Payroll periods can only be created within a tenant context');
    assertFactoryAccess(ctx, dto.factoryId);

    const factory = await this.prisma.db.factory.findUnique({ where: { id: dto.factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');

    return this.prisma.db.payrollPeriod.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: dto.factoryId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
      },
    });
  }

  async list(query: PaginationQueryDto & { factoryId?: string }) {
    const ctx = TenantContextStore.getOrThrow();
    if (query.factoryId) assertFactoryAccess(ctx, query.factoryId);
    const where = factoryScopeFilter(ctx, query.factoryId);
    const [items, total] = await Promise.all([
      this.prisma.db.payrollPeriod.findMany({
        where,
        include: { entries: true },
        skip: query.skip,
        take: query.take,
        orderBy: { periodStart: 'desc' },
      }),
      this.prisma.db.payrollPeriod.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const period = await this.prisma.db.payrollPeriod.findUnique({
      where: { id },
      include: {
        entries: {
          include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        },
      },
    });
    if (!period) throw new NotFoundException('Payroll period not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), period.factoryId);
    return period;
  }

  async addEntry(periodId: string, dto: AddPayrollEntryDto) {
    const period = await this.getById(periodId);
    if (period.status !== 'DRAFT')
      throw new ConflictException('Entries can only be added while the payroll period is in DRAFT status');

    const employee = await this.prisma.db.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const netAmount = dto.baseSalary + dto.overtimeAmount + dto.incentiveAmount - dto.deductions;

    return this.prisma.raw.payrollEntry.upsert({
      where: { payrollPeriodId_employeeId: { payrollPeriodId: periodId, employeeId: dto.employeeId } },
      create: { payrollPeriodId: periodId, ...dto, netAmount },
      update: { ...dto, netAmount },
    });
  }

  async updateStatus(id: string, dto: UpdatePayrollPeriodStatusDto) {
    const existing = await this.getById(id);
    const updated = await this.prisma.db.payrollPeriod.update({
      where: { id },
      data: {
        status: dto.status,
        approvedBy: dto.status === 'APPROVED' ? TenantContextStore.getOrThrow().userId : undefined,
        approvedAt: dto.status === 'APPROVED' ? new Date() : undefined,
      },
    });
    await this.auditService.log({
      action: dto.status === 'APPROVED' ? 'APPROVE' : 'UPDATE',
      entityType: 'PayrollPeriod',
      entityId: id,
      oldValue: { status: existing.status },
      newValue: { status: dto.status },
    });
    return updated;
  }
}
