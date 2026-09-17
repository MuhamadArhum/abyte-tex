import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { AuditModule } from '../../src/audit/audit.module';
import { IdempotencyModule } from '../../src/common/idempotency.module';
import { ProcurementModule } from '../../src/procurement/procurement.module';
import { DispatchModule } from '../../src/dispatch/dispatch.module';
import { ProcurementService } from '../../src/procurement/procurement.service';
import { DispatchService } from '../../src/dispatch/dispatch.service';
import { InventoryService } from '../../src/inventory/inventory.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TenantContextStore } from '../../src/common/tenant-context';
import {
  createCustomer,
  createFactory,
  createProduct,
  createSalesOrder,
  createTenantWithOwner,
  createWarehouse,
  seedStock,
} from '../utils/fixtures';
import { createTestApp } from '../utils/test-app';

/**
 * P0 regression suite for API-001 / API-002 (Goods Receipt and Dispatch were
 * not transaction-wrapped across their business-record write and their
 * inventory-ledger write) and DB-002 (the Stock unique constraint did not
 * prevent duplicate balance rows under concurrent writes when
 * location/batch are null).
 *
 * These are white-box integration tests: real Prisma, a real transaction,
 * against the real `abytetex_test` database — the only thing replaced is
 * `InventoryService.recordMovement`, deliberately made to fail on a specific
 * call so the orchestrating transaction's rollback behavior (the actual
 * fixed logic) can be observed. This is not a mock of the vulnerable logic —
 * `ProcurementService.createGoodsReceipt` / `DispatchService.create`'s own
 * `$transaction` wrapping is exercised for real.
 */
describe('P0 API-001 / API-002 — Goods Receipt & Dispatch atomicity', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let factoryId: string;
  let warehouseId: string;

  beforeAll(async () => {
    // A throwaway app only to get tenant/factory/warehouse fixtures created
    // through the normal Prisma-scoped path; closed immediately after setup.
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'Atomicity Textiles', slug: 'atomic' });
    const factory = await createFactory(app, tenant.tenantId, 'AT1');
    factoryId = factory.id;
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'AT-WH1');
    warehouseId = warehouse.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
    return TenantContextStore.run(
      {
        userId: tenant.userId,
        tenantId: tenant.tenantId,
        isPlatformAdmin: false,
        roleCodes: ['COMPANY_OWNER'],
        allow: new Set(['*:*']),
        deny: new Set(),
        factoryIds: [],
      },
      fn,
    );
  }

  it('API-001 (as of the P1 WF-006 split): createGoodsReceipt no longer touches InventoryService at all — physical receiving and inventory acceptance are two distinct steps', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditModule, IdempotencyModule, ProcurementModule],
    })
      .overrideProvider(InventoryService)
      .useValue({
        recordMovement: jest.fn().mockImplementation(() => {
          throw new Error('recordMovement should not be called by createGoodsReceipt anymore');
        }),
      })
      .compile();

    const procurementService = moduleRef.get(ProcurementService);
    const prisma = moduleRef.get(PrismaService);

    const supplier = await prisma.raw.supplier.create({ data: { tenantId: tenant.tenantId, name: 'Test Supplier' } });
    const material = await prisma.raw.material.create({
      data: { tenantId: tenant.tenantId, code: 'MAT-API001', name: 'Test Material', type: 'YARN', unit: 'KG' },
    });

    const order = await runAsTenant(() =>
      procurementService.createOrder(
        {
          factoryId,
          supplierId: supplier.id,
          items: [{ materialId: material.id, quantity: 100, unit: 'KG', unitPrice: 5 }],
        },
        tenant.userId,
      ),
    );

    // Creation succeeds even though InventoryService would throw if called — proving it
    // is genuinely not invoked during physical receiving anymore (WF-006).
    const receipt = await runAsTenant(() =>
      procurementService.createGoodsReceipt({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 100, acceptedQty: 100 }],
      }),
    );
    expect(receipt.status).toBe('PENDING_QC');

    const movements = await prisma.raw.stockMovement.findMany({ where: { referenceType: 'GoodsReceipt' } });
    expect(movements.filter((m) => m.materialId === material.id)).toHaveLength(0);

    await moduleRef.close();
  });

  it('WF-006 acceptGoodsReceipt: a mid-transaction failure rolls back both the stock movement AND the receipt status change — never left half-accepted', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditModule, IdempotencyModule, ProcurementModule],
    })
      .overrideProvider(InventoryService)
      .useValue({
        recordMovement: jest.fn().mockImplementation(() => {
          throw new Error('Injected failure for WF-006 accept rollback test');
        }),
      })
      .compile();

    const procurementService = moduleRef.get(ProcurementService);
    const prisma = moduleRef.get(PrismaService);

    const supplier = await prisma.raw.supplier.create({ data: { tenantId: tenant.tenantId, name: 'Test Supplier 2' } });
    const material = await prisma.raw.material.create({
      data: { tenantId: tenant.tenantId, code: 'MAT-WF006', name: 'Test Material 2', type: 'YARN', unit: 'KG' },
    });

    const order = await runAsTenant(() =>
      procurementService.createOrder(
        {
          factoryId,
          supplierId: supplier.id,
          items: [{ materialId: material.id, quantity: 50, unit: 'KG', unitPrice: 5 }],
        },
        tenant.userId,
      ),
    );
    const receipt = await runAsTenant(() =>
      procurementService.createGoodsReceipt({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 50, acceptedQty: 50 }],
      }),
    );

    await expect(runAsTenant(() => procurementService.acceptGoodsReceipt(receipt.id, tenant.userId))).rejects.toThrow(
      'Injected failure',
    );

    const stillPending = await prisma.raw.goodsReceipt.findUnique({ where: { id: receipt.id } });
    expect(stillPending?.status).toBe('PENDING_QC');

    const movements = await prisma.raw.stockMovement.findMany({ where: { referenceType: 'GoodsReceipt' } });
    expect(movements.filter((m) => m.materialId === material.id)).toHaveLength(0);

    await moduleRef.close();
  });

  it('API-002: a mid-loop failure rolls back the entire Dispatch — no dispatch, no delivered-qty rollup, no stock movement survives', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, AuditModule, IdempotencyModule, DispatchModule],
    })
      .overrideProvider(InventoryService)
      .useValue({
        recordMovement: jest.fn().mockImplementation(() => {
          throw new Error('Injected failure for API-002 rollback test');
        }),
      })
      .compile();

    const dispatchService = moduleRef.get(DispatchService);
    const prisma = moduleRef.get(PrismaService);

    const product = await prisma.raw.product.create({
      data: { tenantId: tenant.tenantId, sku: 'SKU-API002', name: 'Test Product', unit: 'PCS' },
    });
    const customer = await prisma.raw.customer.create({ data: { tenantId: tenant.tenantId, name: 'Dispatch Customer' } });
    const salesOrder = await prisma.raw.salesOrder.create({
      data: {
        tenantId: tenant.tenantId,
        factoryId,
        customerId: customer.id,
        orderNumber: 'SO-API002',
        status: 'READY',
        items: { create: [{ productId: product.id, quantity: 50, unit: 'PCS', unitPrice: 10, lineTotal: 500 }] },
      },
      include: { items: true },
    });

    await expect(
      runAsTenant(() =>
        dispatchService.create(
          {
            factoryId,
            salesOrderId: salesOrder.id,
            warehouseId,
            items: [{ productId: product.id, salesOrderItemId: salesOrder.items[0].id, quantity: 10, unit: 'PCS' }],
          },
          tenant.userId,
        ),
      ),
    ).rejects.toThrow('Injected failure');

    const dispatches = await prisma.raw.dispatch.findMany({ where: { salesOrderId: salesOrder.id } });
    expect(dispatches).toHaveLength(0);

    const item = await prisma.raw.salesOrderItem.findUnique({ where: { id: salesOrder.items[0].id } });
    expect(Number(item?.deliveredQty)).toBe(0);

    const so = await prisma.raw.salesOrder.findUnique({ where: { id: salesOrder.id } });
    expect(so?.status).toBe('READY');

    await moduleRef.close();
  });

  it('DB-002: two concurrent first-time stock writes for the same never-before-seen key produce exactly one row with the correct summed quantity, not two', async () => {
    const app2 = await createTestApp();
    const inventoryService = app2.get(InventoryService);
    const prisma = app2.get(PrismaService);

    const product = await prisma.raw.product.create({
      data: { tenantId: tenant.tenantId, sku: 'SKU-DB002', name: 'Race Product', unit: 'PCS' },
    });

    const input = {
      warehouseId,
      productId: product.id,
      type: 'RECEIVE' as const,
      quantity: 40,
      unit: 'PCS',
    };

    await Promise.all([
      runAsTenant(() => inventoryService.recordMovement(tenant.userId, input)),
      runAsTenant(() => inventoryService.recordMovement(tenant.userId, input)),
    ]);

    const rows = await prisma.raw.stock.findMany({ where: { warehouseId, productId: product.id } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].quantity)).toBe(80);

    await app2.close();
  });
});
