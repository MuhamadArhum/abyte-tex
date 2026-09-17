import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess, factoryScopeFilter } from '../common/factory-access.util';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateEmployeeDto, UpdateEmployeeDto } from './dto/employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(factoryId: string, dto: CreateEmployeeDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Employees can only be created within a tenant context');
    assertFactoryAccess(ctx, factoryId);

    const factory = await this.prisma.db.factory.findUnique({ where: { id: factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');

    const existing = await this.prisma.db.employee.findFirst({ where: { employeeCode: dto.employeeCode } });
    if (existing) throw new ConflictException(`An employee with code "${dto.employeeCode}" already exists`);

    const employee = await this.prisma.db.employee.create({ data: { ...dto, factoryId, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Employee', entityId: employee.id, newValue: dto });
    return employee;
  }

  async list(factoryId: string | undefined, query: PaginationQueryDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (factoryId) assertFactoryAccess(ctx, factoryId);
    const where = {
      ...factoryScopeFilter(ctx, factoryId),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { employeeCode: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.employee.findMany({
        where,
        include: {
          department: { select: { id: true, name: true } },
          shift: { select: { id: true, name: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.db.employee.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const employee = await this.prisma.db.employee.findUnique({
      where: { id },
      include: { department: true, shift: true, factory: { select: { id: true, name: true, code: true } } },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    assertFactoryAccess(TenantContextStore.getOrThrow(), employee.factoryId);
    return employee;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const existing = await this.getById(id);
    const updated = await this.prisma.db.employee.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Employee',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }
}
