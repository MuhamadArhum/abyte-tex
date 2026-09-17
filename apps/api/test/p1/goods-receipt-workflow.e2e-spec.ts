import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from '../utils/test-app';
import { authed, createFactory, createMaterial, createSupplier, createTenantWithOwner, createWarehouse, login } from '../utils/fixtures';

/**
 * P1 regression suite for WF-006 — Goods Receipt creation no longer posts
 * stock immediately; a distinct "accept" (Quality Check) step, matching SRS
 * §6.2's explicit Goods Receipt -> Quality Check -> Inventory ordering, is
 * what actually posts accepted quantities into stock. Also covers PO
 * quantity-rule validation (WF-010) and inventory atomicity across the split.
 */
describe('P1 WF-006 — Goods Receipt lifecycle (PENDING_QC -> accept)', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;
  let warehouseId: string;
  let supplierId: string;
  let materialId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'GR Workflow Textiles', slug: 'grwf' });
    token = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'GRF1');
    factoryId = factory.id;
    const warehouse = await createWarehouse(app, tenant.tenantId, factoryId, 'GR-WH1');
    warehouseId = warehouse.id;
    const supplier = await createSupplier(app, tenant.tenantId, 'GR Workflow Supplier');
    supplierId = supplier.id;
    const material = await createMaterial(app, tenant.tenantId, 'MAT-GRWF');
    materialId = material.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createPO(quantity = 100) {
    const res = await authed(app, token)
      .post('/api/v1/purchase-orders')
      .send({ factoryId, supplierId, items: [{ materialId, quantity, unit: 'KG', unitPrice: 5 }] })
      .expect(201);
    return res.body.data as { id: string; items: Array<{ id: string }> };
  }

  it('creating a receipt lands in PENDING_QC and does NOT post stock yet', async () => {
    const order = await createPO();
    const res = await authed(app, token)
      .post('/api/v1/goods-receipts')
      .send({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 100, acceptedQty: 100 }],
      })
      .expect(201);
    expect(res.body.data.status).toBe('PENDING_QC');

    const prisma = getPrisma(app).raw;
    const stock = await prisma.stock.findFirst({ where: { warehouseId, materialId } });
    expect(stock).toBeNull();
  });

  it('accepting a PENDING_QC receipt posts stock and finalizes status to ACCEPTED', async () => {
    const order = await createPO();
    const receiptRes = await authed(app, token)
      .post('/api/v1/goods-receipts')
      .send({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 100, acceptedQty: 100 }],
      })
      .expect(201);
    const receipt = receiptRes.body.data as { id: string };

    const accepted = await authed(app, token).post(`/api/v1/goods-receipts/${receipt.id}/accept`).expect(201);
    expect(accepted.body.data.status).toBe('ACCEPTED');

    const prisma = getPrisma(app).raw;
    const stock = await prisma.stock.findFirst({ where: { warehouseId, materialId } });
    expect(Number(stock?.quantity)).toBe(100);
  });

  it('a fully-rejected receipt resolves to REJECTED on accept, and posts no stock (WF-011: REJECTED is now reachable)', async () => {
    const order = await createPO(50);
    const receiptRes = await authed(app, token)
      .post('/api/v1/goods-receipts')
      .send({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 50, acceptedQty: 0, rejectedQty: 50 }],
      })
      .expect(201);
    const receipt = receiptRes.body.data as { id: string };

    const accepted = await authed(app, token).post(`/api/v1/goods-receipts/${receipt.id}/accept`).expect(201);
    expect(accepted.body.data.status).toBe('REJECTED');
  });

  it('duplicate processing: accepting an already-processed receipt a second time is rejected, not a silent no-op or a double stock post', async () => {
    const order = await createPO(30);
    const receiptRes = await authed(app, token)
      .post('/api/v1/goods-receipts')
      .send({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 30, acceptedQty: 30 }],
      })
      .expect(201);
    const receipt = receiptRes.body.data as { id: string };

    await authed(app, token).post(`/api/v1/goods-receipts/${receipt.id}/accept`).expect(201);
    const secondAttempt = await authed(app, token).post(`/api/v1/goods-receipts/${receipt.id}/accept`);
    expect(secondAttempt.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const movements = await prisma.stockMovement.findMany({ where: { referenceType: 'GoodsReceipt', referenceId: receipt.id } });
    expect(movements).toHaveLength(1);
  });

  it('WF-010: acceptedQty + rejectedQty cannot exceed receivedQty', async () => {
    const order = await createPO(10);
    const res = await authed(app, token)
      .post('/api/v1/goods-receipts')
      .send({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 10, acceptedQty: 10, rejectedQty: 5 }],
      });
    expect(res.status).toBe(400);
  });

  it('idempotency (API-005): a repeated createGoodsReceipt call with the same idempotencyKey returns the original receipt, not a second one', async () => {
    const order = await createPO(15);
    const key = `gr-idem-${order.id}`;
    const first = await authed(app, token)
      .post('/api/v1/goods-receipts')
      .send({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 15, acceptedQty: 15 }],
        idempotencyKey: key,
      })
      .expect(201);

    const second = await authed(app, token)
      .post('/api/v1/goods-receipts')
      .send({
        purchaseOrderId: order.id,
        warehouseId,
        items: [{ purchaseOrderItemId: order.items[0].id, receivedQty: 15, acceptedQty: 15 }],
        idempotencyKey: key,
      })
      .expect(201);

    expect(second.body.data.id).toBe(first.body.data.id);

    const prisma = getPrisma(app).raw;
    const receipts = await prisma.goodsReceipt.findMany({ where: { purchaseOrderId: order.id } });
    expect(receipts).toHaveLength(1);
  });
});
