import { INestApplication } from '@nestjs/common';
import { RoleCode } from '../../src/common/rbac.constants';
import { createTestApp, getPrisma } from '../utils/test-app';
import {
  authed,
  createCustomer,
  createFactory,
  createProduct,
  createScopedUser,
  createTenantWithOwner,
  login,
} from '../utils/fixtures';

/**
 * P1 regression suite for WF-001/WF-002 — the Sales Order lifecycle now
 * enforces SRS §6.1's status flow instead of accepting any enum value from
 * any state. Covers every valid transition, the exact invalid case named in
 * the remediation brief (DRAFT -> COMPLETED), unauthorized transitions,
 * missing-data/precondition rejection, repeated-transition rejection,
 * cancellation rules, and completed-order mutation rules.
 */
describe('P1 WF-001/WF-002 — Sales Order workflow', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;
  let productId: string;
  let customerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'SO Workflow Textiles', slug: 'sowf' });
    token = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'SOF1');
    factoryId = factory.id;
    const product = await createProduct(app, tenant.tenantId, 'SKU-SOWF');
    productId = product.id;
    const customer = await createCustomer(app, tenant.tenantId, 'SO Workflow Customer');
    customerId = customer.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createDraftOrder(orderSuffix: string) {
    const res = await authed(app, token)
      .post('/api/v1/sales-orders')
      .send({
        factoryId,
        customerId,
        items: [{ productId, quantity: 10, unit: 'PCS', unitPrice: 5 }],
      })
      .expect(201);
    return res.body.data as { id: string; status: string; orderNumber: string };
  }

  it('rejects the exact invalid case named in the remediation brief: DRAFT -> COMPLETED in one call', async () => {
    const order = await createDraftOrder('invalid-1');
    const res = await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const stillDraft = await prisma.salesOrder.findUnique({ where: { id: order.id } });
    expect(stillDraft?.status).toBe('DRAFT');
  });

  it('every valid transition in the SRS §6.1 chain succeeds in order', async () => {
    const order = await createDraftOrder('valid-chain');

    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'CONFIRMED' }).expect(200);
    await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'PRODUCTION_PLANNED' })
      .expect(200);
    await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'IN_PRODUCTION' })
      .expect(200);
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'QUALITY' }).expect(200);
    const ready = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'READY' })
      .expect(200);
    expect(ready.body.data.status).toBe('READY');
  });

  it('READY is only a legal manual target from QUALITY, not from an earlier state', async () => {
    const order = await createDraftOrder('ready-precondition');
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'CONFIRMED' }).expect(200);

    const readyTooEarly = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'READY' });
    expect(readyTooEarly.status).toBe(400);
  });

  it('DISPATCHED is never a manual target — system-only, set by Dispatch', async () => {
    const order = await createDraftOrder('dispatched-system-only');
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'CONFIRMED' }).expect(200);

    const dispatchedAttempt = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'DISPATCHED' });
    expect(dispatchedAttempt.status).toBe(400);
  });

  it('unauthorized transition: a VIEWER-role user (no APPROVE permission) cannot change status', async () => {
    const order = await createDraftOrder('unauthorized');
    const viewer = await createScopedUser(app, {
      tenantId: tenant.tenantId,
      roleId: tenant.roles[RoleCode.VIEWER].id,
      slug: 'so-viewer',
    });
    const viewerToken = await login(app, viewer.email, viewer.password);

    const res = await authed(app, viewerToken)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(403);
  });

  it('missing required business condition: COMPLETED is rejected unless the order is already DISPATCHED', async () => {
    const order = await createDraftOrder('missing-condition');
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'CONFIRMED' }).expect(200);

    const res = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'COMPLETED' });
    expect(res.status).toBe(400);
  });

  it('repeated transition: confirming an already-CONFIRMED order is rejected, not a silent no-op', async () => {
    const order = await createDraftOrder('repeated');
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'CONFIRMED' }).expect(200);

    const res = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'CONFIRMED' });
    expect(res.status).toBe(400);
  });

  it('cancellation rules: CANCELLED is reachable from DRAFT and is terminal — cannot be revived', async () => {
    const order = await createDraftOrder('cancel-1');
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'CANCELLED' }).expect(200);

    const revive = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'CONFIRMED' });
    expect(revive.status).toBe(400);
  });

  it('cancellation rules: CANCELLED is not reachable once DISPATCHED (physical goods already moved)', async () => {
    // Drive an order to DISPATCHED via a real Dispatch (the only legitimate path).
    const order = await createDraftOrder('cancel-blocked');
    const prisma = getPrisma(app).raw;
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenant.tenantId, factoryId, code: 'CANCEL-WH', name: 'Cancel Test WH', type: 'FINISHED_GOODS' },
    });
    await prisma.stock.create({
      data: { tenantId: tenant.tenantId, warehouseId: warehouse.id, productId, quantity: 100, unit: 'PCS' },
    });

    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'CONFIRMED' }).expect(200);
    await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'PRODUCTION_PLANNED' })
      .expect(200);
    await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'IN_PRODUCTION' })
      .expect(200);
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'QUALITY' }).expect(200);
    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'READY' }).expect(200);

    const orderWithItems = await prisma.salesOrder.findUnique({ where: { id: order.id }, include: { items: true } });
    await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: order.id,
        warehouseId: warehouse.id,
        items: [{ productId, salesOrderItemId: orderWithItems!.items[0].id, quantity: 10, unit: 'PCS' }],
      })
      .expect(201);

    const dispatched = await prisma.salesOrder.findUnique({ where: { id: order.id } });
    expect(dispatched?.status).toBe('DISPATCHED');

    const cancelAttempt = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'CANCELLED' });
    expect(cancelAttempt.status).toBe(400);
  });

  it('completed-order mutation rules: COMPLETED is terminal — no further transition is legal', async () => {
    const order = await createDraftOrder('completed-terminal');
    const prisma = getPrisma(app).raw;
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: tenant.tenantId, factoryId, code: 'DONE-WH', name: 'Completed Test WH', type: 'FINISHED_GOODS' },
    });
    await prisma.stock.create({
      data: { tenantId: tenant.tenantId, warehouseId: warehouse.id, productId, quantity: 100, unit: 'PCS' },
    });

    for (const status of ['CONFIRMED', 'PRODUCTION_PLANNED', 'IN_PRODUCTION', 'QUALITY', 'READY']) {
      await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status }).expect(200);
    }
    const orderWithItems = await prisma.salesOrder.findUnique({ where: { id: order.id }, include: { items: true } });
    await authed(app, token)
      .post('/api/v1/dispatches')
      .send({
        factoryId,
        salesOrderId: order.id,
        warehouseId: warehouse.id,
        items: [{ productId, salesOrderItemId: orderWithItems!.items[0].id, quantity: 10, unit: 'PCS' }],
      })
      .expect(201);

    await authed(app, token).patch(`/api/v1/sales-orders/${order.id}/status`).send({ status: 'COMPLETED' }).expect(200);

    const reopenAttempt = await authed(app, token)
      .patch(`/api/v1/sales-orders/${order.id}/status`)
      .send({ status: 'CONFIRMED' });
    expect(reopenAttempt.status).toBe(400);
  });
});
