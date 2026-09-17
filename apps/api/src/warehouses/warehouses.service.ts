import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { assertFactoryAccess } from '../common/factory-access.util';
import { CreateLocationDto, CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async assertFactoryExists(factoryId: string) {
    assertFactoryAccess(TenantContextStore.getOrThrow(), factoryId);
    const factory = await this.prisma.db.factory.findUnique({ where: { id: factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');
  }

  async create(factoryId: string, dto: CreateWarehouseDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Warehouses can only be created within a tenant context');

    await this.assertFactoryExists(factoryId);
    const existing = await this.prisma.db.warehouse.findFirst({ where: { factoryId, code: dto.code } });
    if (existing) throw new ConflictException(`A warehouse with code "${dto.code}" already exists in this factory`);

    const warehouse = await this.prisma.db.warehouse.create({ data: { ...dto, factoryId, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Warehouse', entityId: warehouse.id, newValue: dto });
    return warehouse;
  }

  async list(factoryId: string) {
    await this.assertFactoryExists(factoryId);
    return this.prisma.db.warehouse.findMany({ where: { factoryId }, orderBy: { name: 'asc' } });
  }

  async getById(factoryId: string, id: string) {
    assertFactoryAccess(TenantContextStore.getOrThrow(), factoryId);
    const warehouse = await this.prisma.db.warehouse.findFirst({
      where: { id, factoryId },
      include: { locations: true },
    });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
    return warehouse;
  }

  async update(factoryId: string, id: string, dto: UpdateWarehouseDto) {
    const existing = await this.getById(factoryId, id);
    const updated = await this.prisma.db.warehouse.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Warehouse',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }

  async addLocation(factoryId: string, warehouseId: string, dto: CreateLocationDto) {
    await this.getById(factoryId, warehouseId);
    const existing = await this.prisma.raw.location.findFirst({ where: { warehouseId, code: dto.code } });
    if (existing) throw new ConflictException(`A location with code "${dto.code}" already exists in this warehouse`);

    return this.prisma.raw.location.create({ data: { ...dto, warehouseId } });
  }

  async listLocations(factoryId: string, warehouseId: string) {
    await this.getById(factoryId, warehouseId);
    return this.prisma.raw.location.findMany({ where: { warehouseId }, orderBy: { code: 'asc' } });
  }
}
