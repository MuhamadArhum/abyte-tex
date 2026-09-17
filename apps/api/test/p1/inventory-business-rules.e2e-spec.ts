import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from '../utils/test-app';
import { authed, createFactory, createMaterial, createTenantWithOwner, createWarehouse, login, seedStock } from '../utils/fixtures';

/**
 * P1 regression suite for INV-001 (transferStock atomicity) and INV-002
 * (negative-stock guard), plus API-006 (manual movements/transfers are now
 * audit-logged).
 */
describe('P1 INV-001/INV-002 — Inventory business rules', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;
  let materialId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'Inventory Rules Textiles', slug: 'invrules' });
    token = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'IRF1');
    factoryId = factory.id;
    const material = await createMaterial(app, tenant.tenantId, 'MAT-INVRULES');
    materialId = material.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('INV-002: an ISSUE that would drive stock negative is rejected, balance unchanged', async () => {
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-WH1');
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId: warehouse.id, materialId, quantity: 10, unit: 'KG' });

    const res = await authed(app, token)
      .post('/api/v1/inventory/movements')
      .send({ warehouseId: warehouse.id, materialId, type: 'ISSUE', quantity: 15, unit: 'KG' });
    expect(res.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const stock = await prisma.stock.findFirst({ where: { warehouseId: warehouse.id, materialId } });
    expect(Number(stock?.quantity)).toBe(10);
  });

  it('INV-002: an ISSUE against an item with zero prior stock history is rejected, not a negative row created', async () => {
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-WH2');
    const res = await authed(app, token)
      .post('/api/v1/inventory/movements')
      .send({ warehouseId: warehouse.id, materialId, type: 'ISSUE', quantity: 5, unit: 'KG' });
    expect(res.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const stock = await prisma.stock.findFirst({ where: { warehouseId: warehouse.id, materialId } });
    expect(stock).toBeNull();
  });

  it('INV-002: an ISSUE within available stock succeeds', async () => {
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-WH3');
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId: warehouse.id, materialId, quantity: 20, unit: 'KG' });

    await authed(app, token)
      .post('/api/v1/inventory/movements')
      .send({ warehouseId: warehouse.id, materialId, type: 'ISSUE', quantity: 5, unit: 'KG' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const stock = await prisma.stock.findFirst({ where: { warehouseId: warehouse.id, materialId } });
    expect(Number(stock?.quantity)).toBe(15);
  });

  it('INV-001: a transfer to a nonexistent destination-side condition still leaves the source decremented only if the whole transfer succeeds (positive path is atomic)', async () => {
    const source = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-SRC1');
    const dest = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-DST1');
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId: source.id, materialId, quantity: 50, unit: 'KG' });

    await authed(app, token)
      .post('/api/v1/inventory/transfer')
      .send({ fromWarehouseId: source.id, toWarehouseId: dest.id, materialId, quantity: 20, unit: 'KG' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const sourceStock = await prisma.stock.findFirst({ where: { warehouseId: source.id, materialId } });
    const destStock = await prisma.stock.findFirst({ where: { warehouseId: dest.id, materialId } });
    expect(Number(sourceStock?.quantity)).toBe(30);
    expect(Number(destStock?.quantity)).toBe(20);
  });

  it('INV-001: transferring more than available at the source is rejected — neither leg applies', async () => {
    const source = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-SRC2');
    const dest = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-DST2');
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId: source.id, materialId, quantity: 10, unit: 'KG' });

    const res = await authed(app, token)
      .post('/api/v1/inventory/transfer')
      .send({ fromWarehouseId: source.id, toWarehouseId: dest.id, materialId, quantity: 50, unit: 'KG' });
    expect(res.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const sourceStock = await prisma.stock.findFirst({ where: { warehouseId: source.id, materialId } });
    const destStock = await prisma.stock.findFirst({ where: { warehouseId: dest.id, materialId } });
    expect(Number(sourceStock?.quantity)).toBe(10);
    expect(destStock).toBeNull();
  });

  it('API-006: a manual stock movement is audit-logged', async () => {
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-WH4');
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId: warehouse.id, materialId, quantity: 10, unit: 'KG' });

    const res = await authed(app, token)
      .post('/api/v1/inventory/movements')
      .send({ warehouseId: warehouse.id, materialId, type: 'ADJUSTMENT', quantity: 5, unit: 'KG' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const auditEntry = await prisma.auditLog.findFirst({
      where: { entityType: 'StockMovement', entityId: res.body.data.id },
    });
    expect(auditEntry).not.toBeNull();
  });

  it('API-006: a manual transfer is audit-logged for both legs', async () => {
    const source = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-SRC3');
    const dest = await createWarehouse(app, tenant.tenantId, factoryId, 'IR-DST3');
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId: source.id, materialId, quantity: 50, unit: 'KG' });

    await authed(app, token)
      .post('/api/v1/inventory/transfer')
      .send({ fromWarehouseId: source.id, toWarehouseId: dest.id, materialId, quantity: 10, unit: 'KG' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const movements = await prisma.stockMovement.findMany({
      where: { OR: [{ warehouseId: source.id, materialId }, { warehouseId: dest.id, materialId }] },
    });
    expect(movements.length).toBeGreaterThanOrEqual(2);
    const auditEntries = await prisma.auditLog.findMany({
      where: { entityType: 'StockMovement', entityId: { in: movements.map((m) => m.id) } },
    });
    expect(auditEntries.length).toBeGreaterThanOrEqual(2);
  });
});
