import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createTestApp, getPrisma } from '../utils/test-app';
import { createFactory, createProduct, createTenantWithOwner, createWarehouse } from '../utils/fixtures';

/**
 * P0 regression suite for the database-integrity findings:
 *  - DB-001: ProductionBatch had no soft-delete and its dependent tables
 *    (MaterialConsumption, QualityInspection, CostSheet) SET NULL on delete,
 *    silently orphaning traceability records.
 *  - DB-003: Product/Material hard-delete silently stripped identity from
 *    historical StockMovement rows (SET NULL).
 *  - DB-004: 9 unused `deletedAt` columns were dead scaffolding, removed —
 *    confirmed here by introspecting the live test database schema.
 */
describe('P0 DB-001 / DB-003 / DB-004 — database integrity fixes', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let factoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'DB Integrity Textiles', slug: 'dbintegrity' });
    const factory = await createFactory(app, tenant.tenantId, 'DB1');
    factoryId = factory.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('DB-001: hard-deleting a ProductionBatch with linked MaterialConsumption history is rejected (Restrict, not silent SET NULL)', async () => {
    const prisma = getPrisma(app).raw;
    const product = await createProduct(app, tenant.tenantId, 'SKU-DB001');
    const order = await prisma.productionOrder.create({
      data: { tenantId: tenant.tenantId, factoryId, productId: product.id, orderNumber: 'PRO-DB001', quantity: 10, unit: 'PCS' },
    });
    const batch = await prisma.productionBatch.create({
      data: {
        tenantId: tenant.tenantId,
        factoryId,
        productionOrderId: order.id,
        productId: product.id,
        batchNumber: 'BATCH-DB001',
        inputQuantity: 10,
      },
    });
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'DB1-WH');
    const material = await prisma.material.create({
      data: { tenantId: tenant.tenantId, code: 'MAT-DB001', name: 'Test Material', type: 'YARN', unit: 'KG' },
    });
    await prisma.materialConsumption.create({
      data: {
        productionOrderId: order.id,
        productionBatchId: batch.id,
        materialId: material.id,
        warehouseId: warehouse.id,
        quantity: 5,
        unit: 'KG',
      },
    });

    await expect(prisma.productionBatch.delete({ where: { id: batch.id } })).rejects.toThrow();

    // The batch and its consumption history are both still present and still linked.
    const stillThere = await prisma.productionBatch.findUnique({ where: { id: batch.id } });
    expect(stillThere).not.toBeNull();
    const consumption = await prisma.materialConsumption.findFirst({ where: { productionBatchId: batch.id } });
    expect(consumption).not.toBeNull();
  });

  it('DB-001: ProductionBatch now has a deletedAt column available for soft-delete', async () => {
    const prisma = getPrisma(app).raw;
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'production_batches' AND column_name = 'deletedAt'
    `);
    expect(rows).toHaveLength(1);
  });

  it('DB-003: hard-deleting a Product with StockMovement ledger history is rejected (Restrict, not silent SET NULL)', async () => {
    const prisma = getPrisma(app).raw;
    const product = await createProduct(app, tenant.tenantId, 'SKU-DB003');
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'DB3-WH');
    await prisma.stockMovement.create({
      data: {
        tenantId: tenant.tenantId,
        warehouseId: warehouse.id,
        productId: product.id,
        type: 'RECEIVE',
        quantity: 10,
        unit: 'PCS',
        createdBy: tenant.userId,
      },
    });

    await expect(prisma.product.delete({ where: { id: product.id } })).rejects.toThrow();

    const movement = await prisma.stockMovement.findFirst({ where: { productId: product.id } });
    expect(movement).not.toBeNull();
    expect(movement?.productId).toBe(product.id);
  });

  it('DB-004: the 9 dead deletedAt columns no longer exist on their tables (confirmed via schema introspection)', async () => {
    const prisma = getPrisma(app).raw;
    const tables = [
      'factories',
      'warehouses',
      'customers',
      'suppliers',
      'products',
      'materials',
      'sales_orders',
      'machines',
      'employees',
    ];
    for (const table of tables) {
      const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = 'deletedAt'
      `);
      expect(rows).toHaveLength(0);
    }
  });

  it('DB-004: User.deletedAt was kept (it is actively read by the login flow) — confirmed still present', async () => {
    const prisma = getPrisma(app).raw;
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'deletedAt'
    `);
    expect(rows).toHaveLength(1);
  });
});
