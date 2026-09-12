import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { PaginationQueryDto, buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateMachineDto, UpdateMachineDto } from './dto/machine.dto';

@Injectable()
export class MachinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(factoryId: string, dto: CreateMachineDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Machines can only be created within a tenant context');

    const factory = await this.prisma.db.factory.findUnique({ where: { id: factoryId } });
    if (!factory) throw new NotFoundException('Factory not found');

    const existing = await this.prisma.db.machine.findFirst({ where: { machineCode: dto.machineCode } });
    if (existing) throw new ConflictException(`A machine with code "${dto.machineCode}" already exists`);

    const machine = await this.prisma.db.machine.create({ data: { ...dto, factoryId, tenantId: ctx.tenantId } });
    await this.auditService.log({ action: 'CREATE', entityType: 'Machine', entityId: machine.id, newValue: dto });
    return machine;
  }

  async list(factoryId: string | undefined, query: PaginationQueryDto) {
    const where = {
      ...(factoryId ? { factoryId } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { machineCode: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.machine.findMany({
        where,
        include: { department: { select: { id: true, name: true } } },
        skip: query.skip,
        take: query.take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder },
      }),
      this.prisma.db.machine.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const machine = await this.prisma.db.machine.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        factory: { select: { id: true, name: true, code: true } },
      },
    });
    if (!machine) throw new NotFoundException('Machine not found');
    return machine;
  }

  async update(id: string, dto: UpdateMachineDto) {
    const existing = await this.getById(id);
    const updated = await this.prisma.db.machine.update({ where: { id }, data: dto });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Machine',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }
}
