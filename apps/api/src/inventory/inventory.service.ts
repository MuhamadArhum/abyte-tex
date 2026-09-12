import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextStore } from '../common/tenant-context';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';

export interface RecordMovementInput {
  warehouseId: string;
  locationId?: string;
  productId?: string;
  materialId?: string;
  batchNumber?: string;
  type: StockMovementType;
  /** Positive for inbound (RECEIVE, RETURN, PRODUCTION_RECEIPT), negative for outbound (ISSUE, CONSUMPTION). ADJUSTMENT/TRANSFER may be either. */
  quantity: number;
  unit: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}

/**
 * Single point of truth for touching stock. Every module that moves inventory
 * (Procurement's goods receipt, Production's material consumption and output,
 * Dispatch) calls through here rather than writing StockMovement/Stock rows
 * itself — see SRS §8.3 ("stock shall never be changed silently").
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends the ledger entry and upserts the running balance in the same
   * transaction, so the two can never drift apart.
   */
  async recordMovement(userId: string, input: RecordMovementInput) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new Error('recordMovement requires a tenant context');
    const tenantId = ctx.tenantId;

    return this.prisma.db.$transaction(async (tx) => {
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          warehouseId: input.warehouseId,
          locationId: input.locationId,
          productId: input.productId,
          materialId: input.materialId,
          batchNumber: input.batchNumber,
          type: input.type,
          quantity: input.quantity,
          unit: input.unit,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          notes: input.notes,
          createdBy: userId,
        },
      });

      const baseStockWhere: Prisma.StockWhereInput = {
        warehouseId: input.warehouseId,
        locationId: input.locationId ?? null,
        productId: input.productId ?? null,
        materialId: input.materialId ?? null,
      };

      // When a specific batch is named, only that batch's row is a match — production
      // receiving into batch X must never touch batch Y's balance. But when no batch is
      // named (the common case for manual adjustments and dispatches that don't care
      // which batch they draw from), matching *only* rows with batchNumber = null would
      // miss stock that was received into a named batch, quietly creating a second,
      // phantom row instead of drawing down the real one — exactly the bug a live
      // end-to-end run of receive → produce → dispatch caught here. So an unbatched
      // request matches ANY existing row for this item, batched or not (oldest first,
      // a rough FIFO), and only falls back to creating a fresh unbatched row if none exists.
      const existingStock = input.batchNumber
        ? await tx.stock.findFirst({ where: { ...baseStockWhere, batchNumber: input.batchNumber } })
        : await tx.stock.findFirst({ where: baseStockWhere, orderBy: { updatedAt: 'asc' } });

      if (existingStock) {
        await tx.stock.update({
          where: { id: existingStock.id },
          data: { quantity: { increment: input.quantity } },
        });
      } else {
        await tx.stock.create({
          data: {
            tenantId,
            warehouseId: input.warehouseId,
            locationId: input.locationId,
            productId: input.productId,
            materialId: input.materialId,
            batchNumber: input.batchNumber,
            quantity: input.quantity,
            unit: input.unit,
          },
        });
      }

      return movement;
    });
  }

  /** Recorded as a paired OUT (source) / IN (destination) movement, per SRS §8.1's "Stock Transfer". */
  async transferStock(
    userId: string,
    input: {
      fromWarehouseId: string;
      fromLocationId?: string;
      toWarehouseId: string;
      toLocationId?: string;
      productId?: string;
      materialId?: string;
      batchNumber?: string;
      quantity: number;
      unit: string;
      notes?: string;
    },
  ) {
    await this.recordMovement(userId, {
      warehouseId: input.fromWarehouseId,
      locationId: input.fromLocationId,
      productId: input.productId,
      materialId: input.materialId,
      batchNumber: input.batchNumber,
      type: 'TRANSFER',
      quantity: -Math.abs(input.quantity),
      unit: input.unit,
      notes: input.notes,
    });
    return this.recordMovement(userId, {
      warehouseId: input.toWarehouseId,
      locationId: input.toLocationId,
      productId: input.productId,
      materialId: input.materialId,
      batchNumber: input.batchNumber,
      type: 'TRANSFER',
      quantity: Math.abs(input.quantity),
      unit: input.unit,
      notes: input.notes,
    });
  }

  async getStockLevels(query: ListStockQueryDto) {
    const where = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.materialId ? { materialId: query.materialId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.stock.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true } },
          material: { select: { id: true, name: true, code: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.db.stock.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async listMovements(query: ListStockQueryDto) {
    const where = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.materialId ? { materialId: query.materialId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.stockMovement.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          product: { select: { id: true, name: true, sku: true } },
          material: { select: { id: true, name: true, code: true } },
        },
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.db.stockMovement.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }
}
