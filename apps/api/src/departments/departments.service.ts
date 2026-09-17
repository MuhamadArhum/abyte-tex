import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess } from '../common/factory-access.util';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto/department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertFactoryExists(factoryId: string) {
    assertFactoryAccess(TenantContextStore.getOrThrow(), factoryId);
    const factory = await this.prisma.db.factory.findUnique({ where: { id: factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');
    return factory;
  }

  async create(factoryId: string, dto: CreateDepartmentDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Departments can only be created within a tenant context');

    await this.assertFactoryExists(factoryId);
    const existing = await this.prisma.db.department.findFirst({ where: { factoryId, code: dto.code } });
    if (existing) throw new ConflictException(`A department with code "${dto.code}" already exists in this factory`);

    const department = await this.prisma.db.department.create({ data: { ...dto, factoryId, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Department', entityId: department.id, newValue: dto });
    return department;
  }

  async list(factoryId: string) {
    await this.assertFactoryExists(factoryId);
    return this.prisma.db.department.findMany({ where: { factoryId }, orderBy: { name: 'asc' } });
  }

  async getById(factoryId: string, id: string) {
    assertFactoryAccess(TenantContextStore.getOrThrow(), factoryId);
    const department = await this.prisma.db.department.findFirst({ where: { id, factoryId } });
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  async update(factoryId: string, id: string, dto: UpdateDepartmentDto) {
    const existing = await this.getById(factoryId, id);
    const updated = await this.prisma.db.department.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Department',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }
}
