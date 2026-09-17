import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { seedTenantRoles } from '../../src/roles/role-seed.util';
import { RoleCode } from '../../src/common/rbac.constants';
import { hashPassword } from '../../src/auth/password.util';
import { getPrisma } from './test-app';

const KNOWN_PASSWORD = 'TestPass123!';

/**
 * Fixture helpers for the P0 regression suite. Setup data (tenants, roles,
 * factories, master data) is written directly via `prisma.raw` — this is test
 * scaffolding, not the thing under test. The actual security/business-rule
 * assertions in each test always go through the real HTTP surface
 * (supertest against the real `AppModule`), so guards, interceptors, and
 * services run exactly as they do in production.
 */

export async function createTenantWithOwner(app: INestApplication, opts: { name: string; slug: string }) {
  const prisma = getPrisma(app).raw;

  // Unique per test run (not just per call) so repeated `jest` invocations against the
  // same persistent `abytetex_test` database never collide on a leftover row from an
  // earlier, possibly-failed run — this suite never truncates/resets the test database.
  const uniqueSlug = `${opts.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenant = await prisma.tenant.create({ data: { name: opts.name, slug: uniqueSlug } });
  const roles = await seedTenantRoles(prisma, tenant.id);

  const passwordHash = await hashPassword(KNOWN_PASSWORD);
  const email = `owner-${uniqueSlug}@example.test`;
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      firstName: 'Owner',
      lastName: opts.slug,
      passwordHash,
      status: 'ACTIVE',
      roles: { create: { roleId: roles[RoleCode.COMPANY_OWNER].id } },
    },
  });

  return { tenantId: tenant.id, roles, userId: user.id, email, password: KNOWN_PASSWORD };
}

/**
 * Creates a second user in the same tenant with a narrower role and, if
 * `factoryIds` is given, an explicit `UserFactoryAccess` allow-list — the
 * exact shape RBAC-001's fix now enforces.
 */
export async function createScopedUser(
  app: INestApplication,
  opts: { tenantId: string; roleId: string; slug: string; factoryIds?: string[] },
) {
  const prisma = getPrisma(app).raw;
  const passwordHash = await hashPassword(KNOWN_PASSWORD);
  const email = `user-${opts.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const user = await prisma.user.create({
    data: {
      tenantId: opts.tenantId,
      email,
      firstName: 'Scoped',
      lastName: opts.slug,
      passwordHash,
      status: 'ACTIVE',
      roles: { create: { roleId: opts.roleId } },
      ...(opts.factoryIds?.length
        ? { factoryAccess: { create: opts.factoryIds.map((factoryId) => ({ factoryId })) } }
        : {}),
    },
  });
  return { userId: user.id, email, password: KNOWN_PASSWORD };
}

export async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed with status ${res.status}. Response body: ${JSON.stringify(res.body)}`);
  }
  const accessToken = res.body?.data?.accessToken ?? res.body?.accessToken;
  if (!accessToken) {
    throw new Error(`Login did not return an accessToken. Response body: ${JSON.stringify(res.body)}`);
  }
  return accessToken;
}

export async function createFactory(app: INestApplication, tenantId: string, code: string) {
  const prisma = getPrisma(app).raw;
  return prisma.factory.create({
    data: { tenantId, code, name: `Factory ${code}`, status: 'ACTIVE' },
  });
}

export async function createWarehouse(app: INestApplication, tenantId: string, factoryId: string, code = 'WH1') {
  const prisma = getPrisma(app).raw;
  return prisma.warehouse.create({
    data: { tenantId, factoryId, code, name: `Warehouse ${code}`, type: 'FINISHED_GOODS' },
  });
}

export async function createProduct(app: INestApplication, tenantId: string, sku: string) {
  const prisma = getPrisma(app).raw;
  return prisma.product.create({
    data: { tenantId, sku, name: `Product ${sku}`, unit: 'PCS' },
  });
}

export async function createCustomer(app: INestApplication, tenantId: string, name: string) {
  const prisma = getPrisma(app).raw;
  return prisma.customer.create({ data: { tenantId, name } });
}

export async function createSupplier(app: INestApplication, tenantId: string, name: string) {
  const prisma = getPrisma(app).raw;
  return prisma.supplier.create({ data: { tenantId, name } });
}

export async function createMaterial(app: INestApplication, tenantId: string, code: string) {
  const prisma = getPrisma(app).raw;
  return prisma.material.create({ data: { tenantId, code, name: `Material ${code}`, type: 'YARN', unit: 'KG' } });
}

export async function createMachine(app: INestApplication, tenantId: string, factoryId: string, code: string) {
  const prisma = getPrisma(app).raw;
  return prisma.machine.create({
    data: { tenantId, factoryId, machineCode: code, name: `Machine ${code}`, type: 'LOOM' },
  });
}

export async function createEmployee(app: INestApplication, tenantId: string, factoryId: string, code: string) {
  const prisma = getPrisma(app).raw;
  return prisma.employee.create({
    data: { tenantId, factoryId, employeeCode: code, firstName: 'Emp', lastName: code },
  });
}

export async function createSalesOrder(
  app: INestApplication,
  params: { tenantId: string; factoryId: string; customerId: string; productId: string; orderNumber: string },
) {
  const prisma = getPrisma(app).raw;
  return prisma.salesOrder.create({
    data: {
      tenantId: params.tenantId,
      factoryId: params.factoryId,
      customerId: params.customerId,
      orderNumber: params.orderNumber,
      status: 'READY',
      items: {
        create: [{ productId: params.productId, quantity: 100, unit: 'PCS', unitPrice: 10, lineTotal: 1000 }],
      },
    },
    include: { items: true },
  });
}

export async function createProductionOrder(
  app: INestApplication,
  params: { tenantId: string; factoryId: string; productId: string; orderNumber: string; salesOrderId?: string },
) {
  const prisma = getPrisma(app).raw;
  return prisma.productionOrder.create({
    data: {
      tenantId: params.tenantId,
      factoryId: params.factoryId,
      productId: params.productId,
      orderNumber: params.orderNumber,
      quantity: 100,
      unit: 'PCS',
      salesOrderId: params.salesOrderId,
    },
  });
}

export async function createProductionBatch(
  app: INestApplication,
  params: {
    tenantId: string;
    factoryId: string;
    productionOrderId: string;
    productId: string;
    batchNumber: string;
    status?: 'IN_PROGRESS' | 'COMPLETED' | 'HOLD';
  },
) {
  const prisma = getPrisma(app).raw;
  return prisma.productionBatch.create({
    data: {
      tenantId: params.tenantId,
      factoryId: params.factoryId,
      productionOrderId: params.productionOrderId,
      productId: params.productId,
      batchNumber: params.batchNumber,
      inputQuantity: 100,
      outputQuantity: 100,
      status: params.status ?? 'COMPLETED',
    },
  });
}

/** Directly receives stock into a warehouse, bypassing the API (fixture setup only). */
export async function seedStock(
  app: INestApplication,
  params: { tenantId: string; warehouseId: string; productId?: string; materialId?: string; batchNumber?: string; quantity: number; unit: string },
) {
  const prisma = getPrisma(app).raw;
  return prisma.stock.create({
    data: {
      tenantId: params.tenantId,
      warehouseId: params.warehouseId,
      productId: params.productId,
      materialId: params.materialId,
      batchNumber: params.batchNumber,
      quantity: params.quantity,
      unit: params.unit,
    },
  });
}

export function authed(app: INestApplication, token: string) {
  const agent = request(app.getHttpServer());
  return {
    get: (url: string) => agent.get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => agent.post(url).set('Authorization', `Bearer ${token}`),
    patch: (url: string) => agent.patch(url).set('Authorization', `Bearer ${token}`),
  };
}
