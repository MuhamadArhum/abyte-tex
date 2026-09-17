import { INestApplication } from '@nestjs/common';
import { RoleCode } from '../../src/common/rbac.constants';
import { createTestApp, getPrisma } from '../utils/test-app';
import {
  authed,
  createFactory,
  createMaterial,
  createScopedUser,
  createSupplier,
  createTenantWithOwner,
  login,
} from '../utils/fixtures';

/**
 * P1 regression suite for WF-004/WF-005 — Purchase Request/Order transitions
 * are now validated (no more "DRAFT -> CONVERTED skipping Approval"), and
 * approval requires a different user than the one who created the
 * request/order (segregation of duties).
 */
describe('P1 WF-004/WF-005 — Purchase Request/Order workflow', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let ownerToken: string;
  let factoryId: string;
  let materialId: string;
  let supplierId: string;
  let secondApproverToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'PO Workflow Textiles', slug: 'powf' });
    ownerToken = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'POF1');
    factoryId = factory.id;
    const material = await createMaterial(app, tenant.tenantId, 'MAT-POWF');
    materialId = material.id;
    const supplier = await createSupplier(app, tenant.tenantId, 'PO Workflow Supplier');
    supplierId = supplier.id;

    const secondApprover = await createScopedUser(app, {
      tenantId: tenant.tenantId,
      roleId: tenant.roles[RoleCode.COMPANY_OWNER].id,
      slug: 'second-approver',
    });
    secondApproverToken = await login(app, secondApprover.email, secondApprover.password);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createRequest() {
    const res = await authed(app, ownerToken)
      .post('/api/v1/purchase-requests')
      .send({ factoryId, items: [{ materialId, quantity: 50, unit: 'KG' }] })
      .expect(201);
    return res.body.data as { id: string; status: string; requestNumber: string };
  }

  it('valid transition: DRAFT -> PENDING_APPROVAL -> APPROVED (different approver)', async () => {
    const request = await createRequest();
    await authed(app, ownerToken)
      .patch(`/api/v1/purchase-requests/${request.id}/status`)
      .send({ status: 'PENDING_APPROVAL' })
      .expect(200);

    const approved = await authed(app, secondApproverToken)
      .patch(`/api/v1/purchase-requests/${request.id}/status`)
      .send({ status: 'APPROVED' })
      .expect(200);
    expect(approved.body.data.status).toBe('APPROVED');
  });

  it('invalid transition: DRAFT -> CONVERTED directly is rejected (cannot skip Approval)', async () => {
    const request = await createRequest();
    const res = await authed(app, ownerToken)
      .patch(`/api/v1/purchase-requests/${request.id}/status`)
      .send({ status: 'CONVERTED' });
    expect(res.status).toBe(400);
  });

  it('invalid transition: DRAFT -> APPROVED directly (skipping PENDING_APPROVAL) is rejected', async () => {
    const request = await createRequest();
    const res = await authed(app, ownerToken)
      .patch(`/api/v1/purchase-requests/${request.id}/status`)
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(400);
  });

  it('segregation of duties: the requester cannot approve their own Purchase Request', async () => {
    const request = await createRequest();
    await authed(app, ownerToken)
      .patch(`/api/v1/purchase-requests/${request.id}/status`)
      .send({ status: 'PENDING_APPROVAL' })
      .expect(200);

    const selfApprove = await authed(app, ownerToken)
      .patch(`/api/v1/purchase-requests/${request.id}/status`)
      .send({ status: 'APPROVED' });
    expect(selfApprove.status).toBe(403);
  });

  it('a Purchase Order cannot be created against a Purchase Request that is not APPROVED', async () => {
    const request = await createRequest();
    await authed(app, ownerToken)
      .patch(`/api/v1/purchase-requests/${request.id}/status`)
      .send({ status: 'PENDING_APPROVAL' })
      .expect(200);

    const res = await authed(app, ownerToken)
      .post('/api/v1/purchase-orders')
      .send({
        factoryId,
        supplierId,
        purchaseRequestId: request.id,
        items: [{ materialId, quantity: 50, unit: 'KG', unitPrice: 10 }],
      });
    expect(res.status).toBe(400);
  });

  it('Purchase Order: DRAFT -> RECEIVED directly is rejected — RECEIVED is system-only, set by Goods Receipt processing', async () => {
    const orderRes = await authed(app, ownerToken)
      .post('/api/v1/purchase-orders')
      .send({ factoryId, supplierId, items: [{ materialId, quantity: 20, unit: 'KG', unitPrice: 10 }] })
      .expect(201);
    const order = orderRes.body.data as { id: string };

    const res = await authed(app, ownerToken)
      .patch(`/api/v1/purchase-orders/${order.id}/status`)
      .send({ status: 'RECEIVED' });
    expect(res.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const stillDraft = await prisma.purchaseOrder.findUnique({ where: { id: order.id } });
    expect(stillDraft?.status).toBe('DRAFT');
  });

  it('segregation of duties: the Purchase Order creator cannot approve their own order', async () => {
    const orderRes = await authed(app, ownerToken)
      .post('/api/v1/purchase-orders')
      .send({ factoryId, supplierId, items: [{ materialId, quantity: 20, unit: 'KG', unitPrice: 10 }] })
      .expect(201);
    const order = orderRes.body.data as { id: string };

    const selfApprove = await authed(app, ownerToken)
      .patch(`/api/v1/purchase-orders/${order.id}/status`)
      .send({ status: 'APPROVED' });
    expect(selfApprove.status).toBe(403);

    const approved = await authed(app, secondApproverToken)
      .patch(`/api/v1/purchase-orders/${order.id}/status`)
      .send({ status: 'APPROVED' });
    expect(approved.status).toBe(200);
  });
});
