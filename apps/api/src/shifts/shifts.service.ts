import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess } from '../common/factory-access.util';
import { CreateShiftDto, UpdateShiftDto } from './dto/shift.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertFactoryExists(factoryId: string) {
    assertFactoryAccess(TenantContextStore.getOrThrow(), factoryId);
    const factory = await this.prisma.db.factory.findUnique({ where: { id: factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');
  }

  async create(factoryId: string, dto: CreateShiftDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Shifts can only be created within a tenant context');

    await this.assertFactoryExists(factoryId);
    const existing = await this.prisma.db.shift.findFirst({ where: { factoryId, name: dto.name } });
    if (existing) throw new ConflictException(`A shift named "${dto.name}" already exists in this factory`);

    const shift = await this.prisma.db.shift.create({ data: { ...dto, factoryId, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Shift', entityId: shift.id, newValue: dto });
    return shift;
  }

  async list(factoryId: string) {
    await this.assertFactoryExists(factoryId);
    return this.prisma.db.shift.findMany({ where: { factoryId }, orderBy: { startTime: 'asc' } });
  }

  async getById(factoryId: string, id: string) {
    assertFactoryAccess(TenantContextStore.getOrThrow(), factoryId);
    const shift = await this.prisma.db.shift.findFirst({ where: { id, factoryId } });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async update(factoryId: string, id: string, dto: UpdateShiftDto) {
    const existing = await this.getById(factoryId, id);
    const updated = await this.prisma.db.shift.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Shift',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }
}
