import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';

/**
 * P0 remediation (API-001/API-002/API-003/API-004): the transaction-client type
 * `recordMovement`/callers pass around when they want to participate in a
 * caller-owned transaction instead of opening their own. This is exactly the
 * shape Prisma itself gives the callback parameter of
 * `PrismaService.db.$transaction(async (tx) => ...)` — the tenant-scoped
 * client minus the methods that aren't valid inside an interactive
 * transaction. Since the tenant-scoping extension propagates into
 * `$transaction` callbacks (Prisma extensions apply recursively to
 * interactive transactions), tenant isolation is preserved whether
 * `recordMovement` opens its own transaction or joins one a caller already
 * opened via `prisma.db.$transaction`.
 */
export type ScopedTx = Omit<
  PrismaService['db'],
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const UNIQUE_VIOLATION = 'P2002';

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
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Appends the ledger entry and upserts the running balance in the same
   * transaction, so the two can never drift apart.
   *
   * P0 remediation (API-001/API-002/API-003/API-004): accepts an optional
   * caller-owned transaction (`tx`). When provided, this method performs its
   * writes on that transaction instead of opening its own, so a caller that
   * needs to make its own business-record write and its inventory-ledger
   * write commit-or-rollback together (Goods Receipt, Dispatch, Batch Output,
   * Material Consumption) can wrap both in one `prisma.db.$transaction(...)`
   * and pass the resulting `tx` down here. When omitted (the previous,
   * still-supported call shape), behavior is unchanged — a fresh transaction
   * is opened just for this movement.
   */
  async recordMovement(userId: string, input: RecordMovementInput, tx?: ScopedTx) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new Error('recordMovement requires a tenant context');
    const tenantId = ctx.tenantId;

    const run = (client: ScopedTx) => this.applyMovement(client, tenantId, userId, input);

    if (tx) {
      // Participating in a caller-owned transaction (Goods Receipt, Dispatch, Production):
      // that caller already audit-logs its own parent document after its transaction
      // commits (see e.g. ProcurementService.createGoodsReceipt). Logging here too would
      // be worse than redundant — AuditService writes via `prisma.raw` on its own
      // connection, independent of `tx`, so an entry logged now would survive even if the
      // caller's transaction later rolls back, recording a movement that never actually
      // happened. Only the two paths below, where `recordMovement`/`transferStock` own
      // their transaction outright, log here.
      return run(tx);
    }

    const movement = await this.prisma.db.$transaction((client) => run(client));

    // P1 remediation (API-006): the manual `POST /inventory/movements` and
    // `POST /inventory/transfer` endpoints previously had no audit trail at all — every
    // other stock-affecting path logs its own parent document, but a direct manual
    // adjustment/receive/issue/transfer (the operator-entered movements least backed by
    // another document) had nothing. Safe to log here unconditionally: this branch only
    // runs when `recordMovement` owns the transaction outright, so by the time this line
    // runs the movement has already committed for real.
    await this.auditService.log({
      action: 'CREATE',
      entityType: 'StockMovement',
      entityId: movement.id,
      newValue: {
        type: input.type,
        warehouseId: input.warehouseId,
        productId: input.productId,
        materialId: input.materialId,
        batchNumber: input.batchNumber,
        quantity: input.quantity,
        unit: input.unit,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    });

    return movement;
  }

  private async applyMovement(tx: ScopedTx, tenantId: string, userId: string, input: RecordMovementInput) {
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
      // P1 remediation (INV-002): reject an OUT movement (or any negative delta) that
      // would drive the balance below zero, instead of silently letting a Stock row go
      // negative. Applied uniformly to every movement type — physical stock cannot be
      // negative regardless of whether the movement is an ISSUE, CONSUMPTION, TRANSFER
      // leg, or a corrective ADJUSTMENT.
      if (input.quantity < 0 && Number(existingStock.quantity) + input.quantity < 0) {
        throw new BadRequestException(
          `Insufficient stock: requested ${Math.abs(input.quantity)} ${input.unit}, only ${existingStock.quantity} ${input.unit} available (warehouse=${input.warehouseId}, batch=${input.batchNumber ?? '-'}).`,
        );
      }
      await tx.stock.update({
        where: { id: existingStock.id },
        data: { quantity: { increment: input.quantity } },
      });
      return movement;
    }

    // P1 remediation (INV-002): no existing row at all means zero on-hand — an OUT
    // movement against a never-received item is always invalid, not a "create a
    // negative row" case.
    if (input.quantity < 0) {
      throw new BadRequestException(
        `Insufficient stock: requested ${Math.abs(input.quantity)} ${input.unit}, but no stock has ever been recorded for this item (warehouse=${input.warehouseId}, batch=${input.batchNumber ?? '-'}).`,
      );
    }

    // P0 remediation (DB-002): two concurrent callers can both reach this branch for the
    // same (warehouse, location, product/material, batch) identity — both saw no existing
    // row a moment ago. A migration-level expression unique index (see
    // prisma/migrations/*_p0_db001_db003_db004_integrity_fixes) now makes Postgres actually
    // detect that conflict (it previously didn't, because NULL <> NULL for the plain
    // composite @@unique). Catch that specific violation and retry the find-then-increment
    // path once: by the time we retry, the other transaction has committed, so the row now
    // exists and this becomes a normal increment — the caller gets a correct merged
    // balance, not a 500.
    try {
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
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        this.logger.warn(
          `Concurrent Stock creation race detected for warehouse=${input.warehouseId} product=${input.productId ?? '-'} material=${input.materialId ?? '-'} batch=${input.batchNumber ?? '-'}; retrying as an increment.`,
        );
        const retryTarget = input.batchNumber
          ? await tx.stock.findFirst({ where: { ...baseStockWhere, batchNumber: input.batchNumber } })
          : await tx.stock.findFirst({ where: baseStockWhere, orderBy: { updatedAt: 'asc' } });
        if (!retryTarget) {
          // Should be unreachable (the conflicting row must exist for the unique
          // violation to have fired) — re-throw rather than silently drop the movement.
          throw error;
        }
        await tx.stock.update({
          where: { id: retryTarget.id },
          data: { quantity: { increment: input.quantity } },
        });
      } else {
        throw error;
      }
    }

    return movement;
  }

  /**
   * Recorded as a paired OUT (source) / IN (destination) movement, per SRS
   * §8.1's "Stock Transfer".
   *
   * P1 remediation (INV-001): both legs now share a single transaction (via
   * `recordMovement`'s optional `tx` parameter) instead of being two
   * independently-committing calls. A failure on the destination leg — a
   * bad warehouse, a DB blip — now rolls the source leg back too, instead of
   * leaving stock decremented from the source with nothing credited to the
   * destination.
   */
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
    const [fromMovement, toMovement] = await this.prisma.db.$transaction(async (tx) => {
      const from = await this.recordMovement(
        userId,
        {
          warehouseId: input.fromWarehouseId,
          locationId: input.fromLocationId,
          productId: input.productId,
          materialId: input.materialId,
          batchNumber: input.batchNumber,
          type: 'TRANSFER',
          quantity: -Math.abs(input.quantity),
          unit: input.unit,
          notes: input.notes,
        },
        tx as ScopedTx,
      );
      const to = await this.recordMovement(
        userId,
        {
          warehouseId: input.toWarehouseId,
          locationId: input.toLocationId,
          productId: input.productId,
          materialId: input.materialId,
          batchNumber: input.batchNumber,
          type: 'TRANSFER',
          quantity: Math.abs(input.quantity),
          unit: input.unit,
          notes: input.notes,
        },
        tx as ScopedTx,
      );
      return [from, to];
    });

    // P1 remediation (API-006): transferStock owns its own outer transaction, so its two
    // `recordMovement` legs run with a `tx` and (correctly) skip logging inside
    // `recordMovement` itself — logged here instead, once the whole transfer has actually
    // committed for real.
    await this.auditService.log({
      action: 'CREATE',
      entityType: 'StockMovement',
      entityId: fromMovement.id,
      newValue: {
        type: 'TRANSFER',
        leg: 'OUT',
        warehouseId: input.fromWarehouseId,
        quantity: -Math.abs(input.quantity),
      },
    });
    await this.auditService.log({
      action: 'CREATE',
      entityType: 'StockMovement',
      entityId: toMovement.id,
      newValue: { type: 'TRANSFER', leg: 'IN', warehouseId: input.toWarehouseId, quantity: Math.abs(input.quantity) },
    });

    return toMovement;
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
