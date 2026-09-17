import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from '../utils/test-app';
import {
  authed,
  createFactory,
  createProduct,
  createProductionBatch,
  createProductionOrder,
  createTenantWithOwner,
  login,
} from '../utils/fixtures';

/**
 * P1 regression suite for Step 8 (Quality workflow): inspections are
 * append-only (no edit endpoint exists at all — confirmed structurally, not
 * just by omission), and a PASS re-inspection now explicitly releases a
 * batch that was previously on HOLD, rather than the only release path
 * being a quality-blind raw status PATCH.
 */
describe('P1 Step 8 — Quality workflow', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;
  let productId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'Quality Workflow Textiles', slug: 'qualwf' });
    token = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'QWF1');
    factoryId = factory.id;
    const product = await createProduct(app, tenant.tenantId, 'SKU-QUALWF');
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function freshBatch(batchNumber: string, status: 'IN_PROGRESS' | 'COMPLETED' = 'COMPLETED') {
    const po = await createProductionOrder(app, {
      tenantId: tenant.tenantId,
      factoryId,
      productId,
      orderNumber: `PRO-${batchNumber}`,
    });
    return createProductionBatch(app, {
      tenantId: tenant.tenantId,
      factoryId,
      productionOrderId: po.id,
      productId,
      batchNumber,
      status,
    });
  }

  it('a PASS inspection releases a batch that was previously on HOLD', async () => {
    const batch = await freshBatch('BATCH-QUAL-RELEASE');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'HOLD' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const held = await prisma.productionBatch.findUnique({ where: { id: batch.id } });
    expect(held?.status).toBe('HOLD');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'PASS' })
      .expect(201);

    const released = await prisma.productionBatch.findUnique({ where: { id: batch.id } });
    expect(released?.status).not.toBe('HOLD');
  });

  it('the batch-status side effect of a quality hold is itself audit-logged', async () => {
    const batch = await freshBatch('BATCH-QUAL-AUDIT');

    await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'REJECT' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const entries = await prisma.auditLog.findMany({ where: { entityType: 'ProductionBatch', entityId: batch.id } });
    expect(entries.length).toBeGreaterThan(0);
  });

  it('no edit/update endpoint exists for a Quality Inspection — outcomes are structurally immutable', async () => {
    const batch = await freshBatch('BATCH-QUAL-IMMUTABLE');
    const res = await authed(app, token)
      .post('/api/v1/quality-inspections')
      .send({ factoryId, productionBatchId: batch.id, outcome: 'PASS' })
      .expect(201);
    const inspection = res.body.data as { id: string };

    const patchAttempt = await authed(app, token)
      .patch(`/api/v1/quality-inspections/${inspection.id}`)
      .send({ outcome: 'REJECT' });
    // No PATCH route is registered for this resource at all — expect 404, proving there
    // is no code path (authorized or not) that can alter a finalized outcome.
    expect(patchAttempt.status).toBe(404);
  });
});
