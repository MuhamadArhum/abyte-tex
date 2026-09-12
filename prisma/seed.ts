import { PrismaClient } from '@prisma/client';
import { PLATFORM_ROLE_CODES, RoleCode } from '../apps/api/src/common/rbac.constants';
import { seedTenantRoles } from '../apps/api/src/roles/role-seed.util';
import { generateOpaqueToken, hashPassword } from '../apps/api/src/auth/password.util';

/**
 * Bootstraps a fresh database:
 *  1. Platform-level roles (SUPER_ADMIN, SUPPORT_ADMIN) + the first platform Super
 *     Admin user, from PLATFORM_SUPER_ADMIN_EMAIL / PLATFORM_SUPER_ADMIN_PASSWORD.
 *  2. In non-production environments only, a demo tenant ("ABC Textile") with its
 *     full seeded role catalog, an active Company Owner login, one factory, and
 *     one warehouse — enough to exercise the MVP acceptance criteria (SRS §22)
 *     manually without hand-crafting records first.
 *
 * Reuses the exact same seedTenantRoles/password utilities the live API uses
 * (apps/api/src/roles/role-seed.util.ts, apps/api/src/auth/password.util.ts) —
 * these are plain, decorator-free TS modules, so they're safe to import directly
 * without bootstrapping a full Nest application context (see D-017 for why the
 * rest of the API isn't imported this way).
 */
async function main() {
  const prisma = new PrismaClient();

  try {
    await seedPlatformSuperAdmin(prisma);

    if (process.env.NODE_ENV !== 'production') {
      await seedDemoTenant(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function seedPlatformSuperAdmin(prisma: PrismaClient) {
  for (const code of PLATFORM_ROLE_CODES) {
    // Postgres treats NULL as distinct for uniqueness purposes, so the @@unique on
    // (tenantId, code) can't be relied on to prevent duplicate platform-level role
    // rows (tenantId is null for those) — check-then-create explicitly instead of
    // upserting by that compound key.
    const existingRole = await prisma.role.findFirst({ where: { tenantId: null, code } });
    if (!existingRole) {
      await prisma.role.create({ data: { tenantId: null, code, name: humanize(code), isSystem: true } });
    }
  }

  const email = process.env.PLATFORM_SUPER_ADMIN_EMAIL;
  const password = process.env.PLATFORM_SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('PLATFORM_SUPER_ADMIN_EMAIL / PLATFORM_SUPER_ADMIN_PASSWORD not set — skipping platform admin seed.');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Platform super admin ${email} already exists — skipping.`);
    return;
  }

  const superAdminRole = await prisma.role.findFirstOrThrow({ where: { tenantId: null, code: RoleCode.SUPER_ADMIN } });
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'AbyteSol',
      lastName: 'Super Admin',
      status: 'ACTIVE',
      isPlatformAdmin: true,
      roles: { create: { roleId: superAdminRole.id } },
    },
  });
  console.log(`Created platform super admin: ${user.email}`);
}

async function seedDemoTenant(prisma: PrismaClient) {
  const slug = 'abc-textile';
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    console.log(`Demo tenant "${slug}" already exists — skipping.`);
    return;
  }

  const ownerEmail = 'owner@abctextile.test';
  const ownerPassword = 'DemoOwner123!';

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: 'ABC Textile', slug, status: 'ACTIVE' } });
    const roles = await seedTenantRoles(tx, tenant.id);

    const passwordHash = await hashPassword(ownerPassword);
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        email: ownerEmail,
        firstName: 'Demo',
        lastName: 'Owner',
        passwordHash,
        status: 'ACTIVE',
        roles: { create: { roleId: roles[RoleCode.COMPANY_OWNER].id } },
      },
    });

    const factory = await tx.factory.create({
      data: { tenantId: tenant.id, code: 'F01', name: 'Factory 01', city: 'Faisalabad' },
    });
    await tx.warehouse.create({
      data: { tenantId: tenant.id, factoryId: factory.id, code: 'WH-RM', name: 'Raw Material Warehouse', type: 'RAW_MATERIAL' },
    });
  });

  console.log(`Created demo tenant "ABC Textile" (slug: ${slug})`);
  console.log(`  Owner login: ${ownerEmail} / ${ownerPassword}`);
}

function humanize(code: string): string {
  return code
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
