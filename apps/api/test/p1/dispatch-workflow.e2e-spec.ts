import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from '../utils/test-app';
import {
  authed,
  createCustomer,
  createFactory,
  createProduct,
  createSalesOrder,
  createTenantWithOwner,
  createWarehouse,
  login,
  seedStock,
} from '../utils/fixtures';

/**
 * P1 regression suite for WF-012 (Dispatch requires a READY Sales Order) and
 * WF-014 (Dispatch cannot over-deliver beyond the ordered quantity).
 * Phase 1's WF-015 suite already covers quality-blocking, so this suite
 * focuses on the two P1-specific preconditions and idempotency. Each test
 * uses its own fresh warehouse — Stock now has a real per-(warehouse,
 * product) uniqueness guarantee (P0 DB-002), so reusing one warehouse across
 * multiple independent `seedStock` calls in the same suite would collide.
 */
describe('P1 WF-012/WF-014 — Dispatch lifecycle preconditions', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;
  let productId: string;
  let customerId: string;
  let warehouseCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'Dispatch Workflow Textiles', slug: 'dspwf' });
    token = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'DSF1');
    factoryId = factory.id;
    const product = await createProduct(app, tenant.tenantId, 'SKU-DSPWF');
    productId = product.id;
    const customer = await createCustomer(app, tenant.tenantId, 'Dispatch Workflow Customer');
    customerId = customer.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function freshWarehouseId(): Promise<string> {
    warehouseCounter += 1;
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, `DS-WH-${warehouseCounter}`);
    return warehouse.id;
  }

  it('WF-012: a Dispatch cannot be created against a DRAFT Sales Order', async () => {
    const warehouseId = await freshWarehouseId();
    const so = await createSalesOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      customerId,
      productId,
      orderNumber: 'SO-WF012-DRAFT',
    });
    const prisma = getPrisma(app).raw;
    await prisma.salesOrder.update({ where: { id: so.id }, data: { status: 'DRAFT' } });
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId, productId, quantity: 50, unit: 'PCS' });

    const res = await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: so.id,
        warehouseId,
        items: [{ productId, salesOrderItemId: so.items[0].id, quantity: 10, unit: 'PCS' }],
      });
    expect(res.status).toBe(400);
  });

  it('WF-012: a Dispatch succeeds once the Sales Order is READY', async () => {
    const warehouseId = await freshWarehouseId();
    const so = await createSalesOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      customerId,
      productId,
      orderNumber: 'SO-WF012-READY',
    });
    const prisma = getPrisma(app).raw;
    await prisma.salesOrder.update({ where: { id: so.id }, data: { status: 'READY' } });
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId, productId, quantity: 50, unit: 'PCS' });

    await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: so.id,
        warehouseId,
        items: [{ productId, salesOrderItemId: so.items[0].id, quantity: 10, unit: 'PCS' }],
      })
      .expect(201);
  });

  it('WF-014: dispatching more than the remaining undelivered balance on a line is rejected', async () => {
    const warehouseId = await freshWarehouseId();
    const so = await createSalesOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      customerId,
      productId,
      orderNumber: 'SO-WF014-CAP',
    });
    const prisma = getPrisma(app).raw;
    await prisma.salesOrder.update({ where: { id: so.id }, data: { status: 'READY' } });
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId, productId, quantity: 500, unit: 'PCS' });

    // Ordered quantity for this fixture's line item is 100 (see createSalesOrder).
    const res = await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: so.id,
        warehouseId,
        items: [{ productId, salesOrderItemId: so.items[0].id, quantity: 150, unit: 'PCS' }],
      });
    expect(res.status).toBe(400);
  });

  it('WF-014: a second partial dispatch cannot push cumulative delivered quantity past the ordered amount', async () => {
    const warehouseId = await freshWarehouseId();
    const so = await createSalesOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      customerId,
      productId,
      orderNumber: 'SO-WF014-PARTIAL',
    });
    const prisma = getPrisma(app).raw;
    await prisma.salesOrder.update({ where: { id: so.id }, data: { status: 'READY' } });
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId, productId, quantity: 500, unit: 'PCS' });

    // Ordered quantity is 100. First dispatch takes 70, leaving 30 remaining.
    await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: so.id,
        warehouseId,
        items: [{ productId, salesOrderItemId: so.items[0].id, quantity: 70, unit: 'PCS' }],
      })
      .expect(201);

    const overshoot = await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: so.id,
        warehouseId,
        items: [{ productId, salesOrderItemId: so.items[0].id, quantity: 40, unit: 'PCS' }],
      });
    expect(overshoot.status).toBe(400);

    const withinRemaining = await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: so.id,
        warehouseId,
        items: [{ productId, salesOrderItemId: so.items[0].id, quantity: 30, unit: 'PCS' }],
      })
      .expect(201);
    expect(withinRemaining.body.data).toBeTruthy();
  });

  it('idempotency (API-005): a repeated Dispatch create call with the same idempotencyKey returns the original dispatch', async () => {
    const warehouseId = await freshWarehouseId();
    const so = await createSalesOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      customerId,
      productId,
      orderNumber: 'SO-WF-IDEM',
    });
    const prisma = getPrisma(app).raw;
    await prisma.salesOrder.update({ where: { id: so.id }, data: { status: 'READY' } });
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId, productId, quantity: 500, unit: 'PCS' });

    const key = `dispatch-idem-${so.id}`;
    const payload = {
      factoryId,
      salesOrderId: so.id,
      warehouseId,
      items: [{ productId, salesOrderItemId: so.items[0].id, quantity: 20, unit: 'PCS' }],
      idempotencyKey: key,
    };
    const first = await authed(app, token).post('/api/v1/dispatches').send(payload).expect(201);
    const second = await authed(app, token).post('/api/v1/dispatches').send(payload).expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    const dispatches = await prisma.dispatch.findMany({ where: { salesOrderId: so.id } });
    expect(dispatches).toHaveLength(1);
  });
});
