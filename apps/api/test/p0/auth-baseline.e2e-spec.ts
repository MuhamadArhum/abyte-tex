import { INestApplication } from '@nestjs/common';
import { RoleCode } from '../../src/common/rbac.constants';
import { createTestApp, getPrisma } from '../utils/test-app';
import { authed, createProduct, createScopedUser, createTenantWithOwner, login } from '../utils/fixtures';

/**
 * P0 authentication/authorization regression baseline for the paths touched
 * by this remediation phase: confirms the backend remains the authoritative
 * boundary (never just the frontend) — an authenticated-but-unauthorized
 * user is rejected, and cross-tenant access by resource ID is impossible
 * (IDOR-by-guessing), consistent with the audit's TEN-005 finding, now
 * pinned down as an actual regression test rather than a one-time manual
 * verification.
 */
describe('P0 — auth/authz regression baseline', () => {
  let app: INestApplication;
  let tenantA: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let tenantB: Awaited<ReturnType<typeof createTenantWithOwner>>;

  beforeAll(async () => {
    app = await createTestApp();
    tenantA = await createTenantWithOwner(app, { name: 'Auth Baseline A', slug: 'authbase-a' });
    tenantB = await createTenantWithOwner(app, { name: 'Auth Baseline B', slug: 'authbase-b' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('unauthenticated request to a protected endpoint is rejected with 401', async () => {
    await authed(app, '').get('/api/v1/products').expect(401);
  });

  it('authenticated but unauthorized (VIEWER role, no CREATE permission) is rejected with 403, not silently allowed', async () => {
    const viewer = await createScopedUser(app, {
      tenantId: tenantA.tenantId,
      roleId: tenantA.roles[RoleCode.VIEWER].id,
      slug: 'viewer',
    });
    const token = await login(app, viewer.email, viewer.password);

    const res = await authed(app, token)
      .post('/api/v1/products')
      .send({ sku: 'SKU-VIEWER-TEST', name: 'Should not be created', unit: 'PCS' });
    expect(res.status).toBe(403);

    const prisma = getPrisma(app).raw;
    const created = await prisma.product.findFirst({ where: { sku: 'SKU-VIEWER-TEST' } });
    expect(created).toBeNull();
  });

  it('cross-tenant IDOR-by-ID-guessing: Tenant A cannot read a Tenant B product by its real ID', async () => {
    const productB = await createProduct(app, tenantB.tenantId, 'SKU-CROSS-TENANT');
    const tokenA = await login(app, tenantA.email, tenantA.password);

    const res = await authed(app, tokenA).get(`/api/v1/products/${productB.id}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('SKU-CROSS-TENANT');
  });

  it('a client-supplied tenantId in the request body is rejected outright (whitelist validation), not silently accepted', async () => {
    const tokenA = await login(app, tenantA.email, tenantA.password);
    // The global ValidationPipe's forbidNonWhitelisted rejects the unrecognized field
    // with 400 before the request ever reaches the service layer — stricter than
    // "silently stripped," which is itself a valid, equally-safe alternative design.
    const res = await authed(app, tokenA)
      .post('/api/v1/products')
      .send({ sku: 'SKU-SPOOF-TEST', name: 'Spoof attempt', unit: 'PCS', tenantId: tenantB.tenantId });
    expect(res.status).toBe(400);

    const prisma = getPrisma(app).raw;
    const created = await prisma.product.findFirst({ where: { sku: 'SKU-SPOOF-TEST' } });
    expect(created).toBeNull();
  });

  it('creating a product without a spoofed tenantId succeeds and always belongs to the caller own tenant', async () => {
    const tokenA = await login(app, tenantA.email, tenantA.password);
    const res = await authed(app, tokenA)
      .post('/api/v1/products')
      .send({ sku: 'SKU-OWNTENANT-TEST', name: 'Own tenant product', unit: 'PCS' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const created = await prisma.product.findUnique({ where: { id: res.body.data.id } });
    expect(created?.tenantId).toBe(tenantA.tenantId);
  });
});
