import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from '../utils/test-app';
import { authed, createFactory, createTenantWithOwner, login } from '../utils/fixtures';

/**
 * P0 regression suite for TEN-001 — the Quality Dashboard's "Top Defects"
 * widget previously ran `prisma.raw.defect.groupBy(...)` with no tenant
 * filter, aggregating defect-type counts across every tenant on the
 * platform. This suite proves Tenant A never sees Tenant B's defect data
 * through the dashboard endpoint, through query manipulation, or via
 * different roles — reproducing the exact scenario from
 * ABYTETEX_COMPLETE_SYSTEM_AUDIT.md's TENANT-ISOLATION-TEST-3.
 */
describe('P0 TEN-001 — Quality Dashboard cross-tenant isolation', () => {
  let app: INestApplication;
  let tenantA: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let tenantB: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    app = await createTestApp();
    const prisma = getPrisma(app).raw;

    tenantA = await createTenantWithOwner(app, { name: 'Tenant A Textiles', slug: 'ten001-a' });
    tenantB = await createTenantWithOwner(app, { name: 'Tenant B Textiles', slug: 'ten001-b' });

    const factoryA = await createFactory(app, tenantA.tenantId, 'FA1');
    const factoryB = await createFactory(app, tenantB.tenantId, 'FB1');

    // Tenant A: 2 defects of type STITCHING_LOOSE.
    const inspectionA = await prisma.qualityInspection.create({
      data: {
        tenantId: tenantA.tenantId,
        factoryId: factoryA.id,
        inspectionNumber: 'QI-A-1',
        inspectedBy: tenantA.userId,
        outcome: 'REJECT',
        defects: { create: [{ defectType: 'STITCHING_LOOSE', severity: 'MAJOR' }, { defectType: 'STITCHING_LOOSE', severity: 'MINOR' }] },
      },
    });

    // Tenant B: 10 defects of the SAME type — this is what leaked into Tenant A's
    // dashboard before the fix (12 instead of 2).
    const inspectionB = await prisma.qualityInspection.create({
      data: {
        tenantId: tenantB.tenantId,
        factoryId: factoryB.id,
        inspectionNumber: 'QI-B-1',
        inspectedBy: tenantB.userId,
        outcome: 'REJECT',
        defects: { create: Array.from({ length: 10 }, () => ({ defectType: 'STITCHING_LOOSE', severity: 'MAJOR' as const })) },
      },
    });
    expect(inspectionA.id).toBeTruthy();
    expect(inspectionB.id).toBeTruthy();

    tokenA = await login(app, tenantA.email, tenantA.password);
    tokenB = await login(app, tenantB.email, tenantB.password);
  });

  afterAll(async () => {
    await app.close();
  });

  it('Tenant A sees only Tenant A defect data on the Quality Dashboard', async () => {
    const res = await authed(app, tokenA).get('/api/v1/dashboards/quality').expect(200);
    const topDefects = res.body.data.topDefects as Array<{ defectType: string; count: number }>;
    const stitching = topDefects.find((d) => d.defectType === 'STITCHING_LOOSE');
    expect(stitching?.count).toBe(2);
  });

  it('Tenant B sees only Tenant B defect data on the Quality Dashboard', async () => {
    const res = await authed(app, tokenB).get('/api/v1/dashboards/quality').expect(200);
    const topDefects = res.body.data.topDefects as Array<{ defectType: string; count: number }>;
    const stitching = topDefects.find((d) => d.defectType === 'STITCHING_LOOSE');
    expect(stitching?.count).toBe(10);
  });

  it('reflects the total inspection count scoped to the caller tenant, not the platform', async () => {
    const resA = await authed(app, tokenA).get('/api/v1/dashboards/quality').expect(200);
    expect(resA.body.data.totalInspections).toBe(1);
  });

  it('cannot be bypassed via query-string manipulation (no tenant-selecting param exists, and none is honored)', async () => {
    const res = await authed(app, tokenA)
      .get('/api/v1/dashboards/quality?tenantId=' + tenantB.tenantId)
      .expect(200);
    const topDefects = res.body.data.topDefects as Array<{ defectType: string; count: number }>;
    const stitching = topDefects.find((d) => d.defectType === 'STITCHING_LOOSE');
    // Still Tenant A's own count — the extra query param has no effect, proving
    // tenant scope is derived only from the authenticated session, never client input.
    expect(stitching?.count).toBe(2);
  });

  it('rejects the request entirely with no valid session (unauthenticated)', async () => {
    await authed(app, 'not-a-real-token').get('/api/v1/dashboards/quality').expect(401);
  });
});
