import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from '../utils/test-app';
import {
  authed,
  createFactory,
  createMaterial,
  createProduct,
  createTenantWithOwner,
  createWarehouse,
  login,
  seedStock,
} from '../utils/fixtures';

/**
 * P1 regression suite for WF-007 (Production Order/Batch lifecycle) and
 * INV-004 (output could skip inventory via an optional warehouse field).
 * Covers: material-before-start is not gated (documented, not a bug),
 * completion requires real output evidence, consumption blocked on a closed
 * order, and duplicate output recording is now blocked (idempotency).
 */
describe('P1 WF-007 — Production Order/Batch workflow', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;
  let warehouseId: string;
  let productId: string;
  let materialId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'PROD Workflow Textiles', slug: 'prodwf' });
    token = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'PRF1');
    factoryId = factory.id;
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'PR-WH1');
    warehouseId = warehouse.id;
    const product = await createProduct(app, tenant.tenantId, 'SKU-PRODWF');
    productId = product.id;
    const material = await createMaterial(app, tenant.tenantId, 'MAT-PRODWF');
    materialId = material.id;
    await seedStock(app, { tenantId: tenant.tenantId, warehouseId, materialId, quantity: 1000, unit: 'KG' });
  });

  afterAll(async () => {
    await app.close();
  });

  async function createOrder(quantity = 100) {
    const res = await authed(app, token)
      .post('/api/v1/production-orders')
      .send({ factoryId, productId, quantity, unit: 'PCS' })
      .expect(201);
    return res.body.data as { id: string };
  }

  async function createBatch(productionOrderId: string, inputQuantity = 50) {
    const res = await authed(app, token)
      .post('/api/v1/production-batches')
      .send({ productionOrderId, inputQuantity })
      .expect(201);
    return res.body.data as { id: string; batchNumber: string; status: string };
  }

  it('invalid transition: PLANNED -> COMPLETED directly (skipping RELEASED/IN_PROGRESS) is rejected', async () => {
    const order = await createOrder();
    const res = await authed(app, token)
      .patch(`/api/v1/production-orders/${order.id}/status`)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });

  it('valid transition chain: PLANNED -> RELEASED -> IN_PROGRESS succeeds', async () => {
    const order = await createOrder();
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'RELEASED' }).expect(200);
    const inProgress = await authed(app, token)
      .patch(`/api/v1/production-orders/${order.id}/status`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(inProgress.body.data.status).toBe('IN_PROGRESS');
  });

  it('completion requires real production evidence: COMPLETED is rejected with zero batches', async () => {
    const order = await createOrder();
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'RELEASED' }).expect(200);
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);

    const res = await authed(app, token)
      .patch(`/api/v1/production-orders/${order.id}/status`)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });

  it('completion succeeds once a batch with real output exists', async () => {
    const order = await createOrder();
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'RELEASED' }).expect(200);
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
    const batch = await createBatch(order.id);
    await authed(app, token)
      .patch(`/api/v1/production-batches/${batch.id}/output`)
      .send({ outputQuantity: 48, wastage: 2, outputWarehouseId: warehouseId })
      .expect(200);

    const completed = await authed(app, token)
      .patch(`/api/v1/production-orders/${order.id}/status`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(completed.body.data.status).toBe('COMPLETED');
  });

  it('INV-004: recording output with outputQuantity > 0 but no outputWarehouseId is rejected, not silently skipped', async () => {
    const order = await createOrder();
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'RELEASED' }).expect(200);
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
    const batch = await createBatch(order.id);

    const res = await authed(app, token)
      .patch(`/api/v1/production-batches/${batch.id}/output`)
      .send({ outputQuantity: 48 });
    expect(res.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const stillInProgress = await prisma.productionBatch.findUnique({ where: { id: batch.id } });
    expect(stillInProgress?.status).toBe('IN_PROGRESS');
  });

  it('duplicate output recording: calling recordBatchOutput twice on a COMPLETED batch is rejected, not a double stock post', async () => {
    const order = await createOrder();
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'RELEASED' }).expect(200);
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
    const batch = await createBatch(order.id);

    await authed(app, token)
      .patch(`/api/v1/production-batches/${batch.id}/output`)
      .send({ outputQuantity: 48, outputWarehouseId: warehouseId })
      .expect(200);

    const secondAttempt = await authed(app, token)
      .patch(`/api/v1/production-batches/${batch.id}/output`)
      .send({ outputQuantity: 48, outputWarehouseId: warehouseId });
    expect(secondAttempt.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const movements = await prisma.stockMovement.findMany({
      where: { referenceType: 'ProductionBatch', referenceId: batch.id },
    });
    expect(movements).toHaveLength(1);
  });

  it('material cannot be consumed against a COMPLETED Production Order', async () => {
    const order = await createOrder();
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'RELEASED' }).expect(200);
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
    const batch = await createBatch(order.id);
    await authed(app, token)
      .patch(`/api/v1/production-batches/${batch.id}/output`)
      .send({ outputQuantity: 48, outputWarehouseId: warehouseId })
      .expect(200);
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'COMPLETED' }).expect(200);

    const res = await authed(app, token)
      .post('/api/v1/material-consumptions')
      .send({ productionOrderId: order.id, materialId, warehouseId, quantity: 10, unit: 'KG' });
    expect(res.status).toBe(400);
  });

  it('cancellation is allowed after some material has already been consumed (historical consumption is not reversed)', async () => {
    const order = await createOrder();
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'RELEASED' }).expect(200);
    await authed(app, token).patch(`/api/v1/production-orders/${order.id}/status`).send({ status: 'IN_PROGRESS' }).expect(200);
    await authed(app, token)
      .post('/api/v1/material-consumptions')
      .send({ productionOrderId: order.id, materialId, warehouseId, quantity: 5, unit: 'KG' })
      .expect(201);

    const cancelled = await authed(app, token)
      .patch(`/api/v1/production-orders/${order.id}/status`)
      .send({ status: 'CANCELLED' })
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');

    const prisma = getPrisma(app).raw;
    const consumption = await prisma.materialConsumption.findFirst({ where: { productionOrderId: order.id } });
    expect(consumption).not.toBeNull();
  });
});
