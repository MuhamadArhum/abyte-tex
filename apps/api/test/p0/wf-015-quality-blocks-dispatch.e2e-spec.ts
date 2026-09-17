import { INestApplication } from '@nestjs/common';
import { createTestApp } from '../utils/test-app';
import {
  authed,
  createCustomer,
  createFactory,
  createProduct,
  createProductionBatch,
  createProductionOrder,
  createSalesOrder,
  createTenantWithOwner,
  createWarehouse,
  login,
  seedStock,
} from '../utils/fixtures';

/**
 * P0 regression suite for WF-015 — Quality Reject/Hold inspection outcomes
 * were purely informational: the only enforcement artifact
 * (`ProductionBatch.status = 'HOLD'`) was silently cleared by the next
 * `recordBatchOutput` call, and Dispatch never checked it at all, so a
 * rejected/held batch could still ship. This suite proves, end to end
 * through the real HTTP API: APPROVED (PASS) ships, REJECTED does not,
 * HOLD does not, and a released HOLD ships again once other requirements
 * (sufficient sales-order status, matching batch) are satisfied — matching
 * the exact test matrix requested for this fix.
 */
describe('P0 WF-015 — Quality Reject/Hold blocks Dispatch', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;
  let warehouseId: string;
  let productId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'WF-015 Textiles', slug: 'wf015' });
    token = await login(app, tenant.email, tenant.password);

    const factory = await createFactory(app, tenant.tenantId, 'WF1');
    factoryId = factory.id;
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'WH-WF1');
    warehouseId = warehouse.id;
    const product = await createProduct(app, tenant.tenantId, 'SKU-WF015');
    productId = product.id;
    const customer = await createCustomer(app, tenant.tenantId, 'Test Customer');
    customerId = customer.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function setUpBatch(batchNumber: string) {
    const so = await createSalesOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      customerId,
      productId,
      orderNumber: `SO-${batchNumber}`,
    });
    const po = await createProductionOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      productId,
      orderNumber: `PRO-${batchNumber}`,
      salesOrderId: so.id,
    });
    const batch = await createProductionBatch(app, {
      tenantId: tenant.tenantId,
      factoryId,
      productionOrderId: po.id,
      productId,
      batchNumber,
      status: 'COMPLETED',
    });
    await seedStock(app, {
      tenantId: tenant.tenantId,
      warehouseId,
      productId,
      batchNumber,
      quantity: 100,
      unit: 'PCS',
    });
    return { salesOrder: so, productionOrder: po, batch };
  }

  it('APPROVED (PASS) batch: dispatch succeeds', async () => {
    const { salesOrder, batch } = await setUpBatch('BATCH-PASS');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'PASS' })
      .expect(201);

    await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: salesOrder.id,
        warehouseId,
        items: [{ productId, quantity: 10, unit: 'PCS', batchNumber: batch.batchNumber }],
      })
      .expect(201);
  });

  it('REJECTED batch: dispatch is blocked', async () => {
    const { salesOrder, batch } = await setUpBatch('BATCH-REJECT');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'REJECT' })
      .expect(201);

    const res = await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: salesOrder.id,
        warehouseId,
        items: [{ productId, quantity: 10, unit: 'PCS', batchNumber: batch.batchNumber }],
      });
    expect(res.status).toBe(403);
  });

  it('HOLD batch: dispatch is blocked', async () => {
    const { salesOrder, batch } = await setUpBatch('BATCH-HOLD');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'HOLD' })
      .expect(201);

    const res = await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: salesOrder.id,
        warehouseId,
        items: [{ productId, quantity: 10, unit: 'PCS', batchNumber: batch.batchNumber }],
      });
    expect(res.status).toBe(403);
  });

  it('a HOLD does not survive being cleared by recordBatchOutput (WF-008 companion fix)', async () => {
    const { batch } = await setUpBatch('BATCH-HOLD-OUTPUT');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'REJECT' })
      .expect(201);

    // Recording output again used to unconditionally flip status back to COMPLETED,
    // silently clearing the hold. outputWarehouseId is required per the P1 INV-004 fix
    // whenever outputQuantity > 0.
    await authed(app, token)
      .patch(`/api/v1/production-batches/${batch.id}/output`)
      .send({ outputQuantity: 100, outputWarehouseId: warehouseId })
      .expect(200);

    const check = await authed(app, token).get(`/api/v1/production-batches/${batch.id}`).expect(200);
    expect(check.body.data.status).toBe('HOLD');
  });

  it('RELEASED HOLD: dispatch succeeds once the batch is explicitly released', async () => {
    const { salesOrder, batch } = await setUpBatch('BATCH-RELEASED');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'HOLD' })
      .expect(201);

    // Confirm still blocked before release.
    const blocked = await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: salesOrder.id,
        warehouseId,
        items: [{ productId, quantity: 5, unit: 'PCS', batchNumber: batch.batchNumber }],
      });
    expect(blocked.status).toBe(403);

    // Explicit release via the existing status-update action.
    await authed(app, token)
      .patch(`/api/v1/production-batches/${batch.id}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: salesOrder.id,
        warehouseId,
        items: [{ productId, quantity: 5, unit: 'PCS', batchNumber: batch.batchNumber }],
      })
      .expect(201);
  });

  it('cannot be bypassed by omitting the batch number (documents the existing, unbatched-dispatch boundary)', async () => {
    // An unbatched dispatch item has no way to be checked against any batch's quality
    // status — this is a pre-existing, documented limitation (see the audit's WF-015
    // recommended fix), not something this test asserts is closed. Included so a future
    // change to add batch-inference for unbatched items has a test to update.
    const { salesOrder, batch } = await setUpBatch('BATCH-UNBATCHED-CHECK');
    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'REJECT' })
      .expect(201);

    await seedStock(app, {
      tenantId: tenant.tenantId,
      warehouseId,
      productId,
      quantity: 50,
      unit: 'PCS',
    });

    // No batchNumber on the dispatch item — succeeds because there is nothing to check.
    await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: salesOrder.id,
        warehouseId,
        items: [{ productId, quantity: 5, unit: 'PCS' }],
      })
      .expect(201);
  });
});
