import { INestApplication } from '@nestjs/common';
import { RoleCode } from '../../src/common/rbac.constants';
import { createTestApp, getPrisma } from '../utils/test-app';
import {
  authed,
  createEmployee,
  createFactory,
  createMachine,
  createScopedUser,
  createTenantWithOwner,
  login,
} from '../utils/fixtures';

/**
 * P0 regression suite for RBAC-001 — `UserFactoryAccess` was computed into the
 * request context on every request but never actually checked by any
 * service. A user restricted to Factory 01 could read and write every other
 * factory's Machines/Employees in the SAME tenant. This suite reproduces the
 * exact scenario from ABYTETEX_COMPLETE_SYSTEM_AUDIT.md's RBAC-TEST-1 across
 * direct-by-id access, list endpoints, create, and update — for both
 * resources named in the finding — plus confirms an unrestricted role
 * (Company Owner, no UserFactoryAccess rows) keeps full access, matching the
 * documented "empty factoryIds = no restriction" design.
 */
describe('P0 RBAC-001 — factory-level access enforcement', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let factory1: { id: string };
  let factory2: { id: string };
  let restrictedToken: string;
  let ownerToken: string;
  let machineInFactory2: { id: string };
  let employeeInFactory2: { id: string };

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'RBAC-001 Textiles', slug: 'rbac001' });
    factory1 = await createFactory(app, tenant.tenantId, 'RF1');
    factory2 = await createFactory(app, tenant.tenantId, 'RF2');

    machineInFactory2 = await createMachine(app, tenant.tenantId, factory2.id, 'MC-F2');
    employeeInFactory2 = await createEmployee(app, tenant.tenantId, factory2.id, 'EMP-F2');

    // Restricted user: same tenant, Company Owner-level permissions (so any 403 below is
    // provably about FACTORY scope, not resource-permission scope), but UserFactoryAccess
    // limited to Factory 1 only.
    const restricted = await createScopedUser(app, {
      tenantId: tenant.tenantId,
      roleId: tenant.roles[RoleCode.COMPANY_OWNER].id,
      slug: 'restricted',
      factoryIds: [factory1.id],
    });

    restrictedToken = await login(app, restricted.email, restricted.password);
    ownerToken = await login(app, tenant.email, tenant.password);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Machines', () => {
    it('GET by id: factory-restricted user cannot read another factory machine (direct API access via resource ID)', async () => {
      const res = await authed(app, restrictedToken).get(`/api/v1/machines/${machineInFactory2.id}`);
      expect([403, 404]).toContain(res.status);
    });

    it('GET by id: unrestricted Company Owner CAN read it (baseline — proves the block above is factory-scope, not a general bug)', async () => {
      await authed(app, ownerToken).get(`/api/v1/machines/${machineInFactory2.id}`).expect(200);
    });

    it('LIST (factory-nested): factory-restricted user is denied listing another factory machines', async () => {
      const res = await authed(app, restrictedToken).get(`/api/v1/factories/${factory2.id}/machines`);
      expect([403, 404]).toContain(res.status);
    });

    it('LIST (tenant-wide): factory-restricted user does not see another factory machines even via the unfiltered list', async () => {
      const res = await authed(app, restrictedToken).get('/api/v1/machines').expect(200);
      const ids = (res.body.data as Array<{ id: string }>).map((m) => m.id);
      expect(ids).not.toContain(machineInFactory2.id);
    });

    it('CREATE: factory-restricted user cannot create a machine in another factory', async () => {
      const res = await authed(app, restrictedToken)
        .post(`/api/v1/factories/${factory2.id}/machines`)
        .send({ machineCode: 'NEW-F2', name: 'New machine', type: 'LOOM' });
      expect([403, 404]).toContain(res.status);
    });

    it('CREATE: factory-restricted user CAN create a machine in their own allowed factory', async () => {
      await authed(app, restrictedToken)
        .post(`/api/v1/factories/${factory1.id}/machines`)
        .send({ machineCode: 'NEW-F1', name: 'New machine', type: 'LOOM' })
        .expect(201);
    });

    it('UPDATE: factory-restricted user cannot update another factory machine', async () => {
      const res = await authed(app, restrictedToken)
        .patch(`/api/v1/machines/${machineInFactory2.id}`)
        .send({ name: 'Hijacked name' });
      expect([403, 404]).toContain(res.status);

      const prisma = getPrisma(app).raw;
      const stillOriginal = await prisma.machine.findUnique({ where: { id: machineInFactory2.id } });
      expect(stillOriginal?.name).not.toBe('Hijacked name');
    });
  });

  describe('Employees', () => {
    it('GET by id: factory-restricted user cannot read another factory employee', async () => {
      const res = await authed(app, restrictedToken).get(`/api/v1/employees/${employeeInFactory2.id}`);
      expect([403, 404]).toContain(res.status);
    });

    it('LIST (factory-nested): denied for another factory', async () => {
      const res = await authed(app, restrictedToken).get(`/api/v1/factories/${factory2.id}/employees`);
      expect([403, 404]).toContain(res.status);
    });

    it('LIST (tenant-wide): another factory employee is excluded, not just hidden client-side', async () => {
      const res = await authed(app, restrictedToken).get('/api/v1/employees').expect(200);
      const ids = (res.body.data as Array<{ id: string }>).map((e) => e.id);
      expect(ids).not.toContain(employeeInFactory2.id);
    });

    it('CREATE: factory-restricted user cannot create an employee in another factory', async () => {
      const res = await authed(app, restrictedToken)
        .post(`/api/v1/factories/${factory2.id}/employees`)
        .send({ employeeCode: 'NEWEMP-F2', firstName: 'New', lastName: 'Employee' });
      expect([403, 404]).toContain(res.status);
    });

    it('UPDATE: factory-restricted user cannot update another factory employee', async () => {
      const res = await authed(app, restrictedToken)
        .patch(`/api/v1/employees/${employeeInFactory2.id}`)
        .send({ firstName: 'Hijacked' });
      expect([403, 404]).toContain(res.status);
    });
  });

  it('unrestricted Company Owner (no UserFactoryAccess rows) retains full cross-factory access — confirms empty factoryIds means no restriction, not "access nothing"', async () => {
    await authed(app, ownerToken).get(`/api/v1/machines/${machineInFactory2.id}`).expect(200);
    await authed(app, ownerToken).get(`/api/v1/employees/${employeeInFactory2.id}`).expect(200);
    await authed(app, ownerToken).get(`/api/v1/factories/${factory2.id}/machines`).expect(200);
  });
});
