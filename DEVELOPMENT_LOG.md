# Development Log

Reverse-chronological. Each entry: what shipped, what changed, what's still open.

---

## 2026-09-11/12 — Phase 1: Foundation (repo scaffold, database, auth, RBAC, core platform APIs)

### What was implemented
- **Monorepo scaffold** per SRS §19: `apps/{web,api,worker}`, `packages/{types,validation,config}`, `prisma/`, `infra/`, `docs/`. npm workspaces (not pnpm — see D-001).
- **Full Prisma schema** (`prisma/schema.prisma`) covering every domain in SRS §17.1: platform/tenancy, commercial, production, inventory, quality/maintenance, workforce, finance/logistics, platform services. ~50 models. Validates and generates cleanly.
- **Multi-tenant isolation** (`apps/api/src/prisma`, `apps/api/src/common/tenant-context.ts`): AsyncLocalStorage-backed request context + a Prisma Client Extension (`PrismaService.db`) that auto-injects `tenantId` into every query against a tenant-scoped model. `PrismaService.raw` is the escape hatch for platform-level code. See D-005, D-014, D-015.
- **RBAC** (`apps/api/src/common/rbac.constants.ts`, `apps/api/src/roles/`): the 16-role catalog from SRS §4.1, the 8-action permission model from §4.2, default per-role permission grants, per-user overrides (`UserPermissionOverride`), per-factory access (`UserFactoryAccess`). Enforced via `PermissionsGuard` + `@RequirePermission()`.
- **Auth** (`apps/api/src/auth/`): login/logout, JWT access token (15m) + rotating opaque refresh token (30d, httpOnly cookie, hashed at rest), change-password, forgot/reset-password (email-based, 1h token). argon2id hashing. Login attempts and history recorded (`LoginHistory`).
- **Platform tenant provisioning** (`apps/api/src/tenants/`): `POST /tenants` creates a tenant, seeds its full role catalog, creates the Company Owner user, emails a set-password link. Platform-admin gated.
- **Tenant user management** (`apps/api/src/users/`): invite, list, get, update (roles/factory access/status).
- **Master config CRUD**: Factories, Departments, Warehouses (+ Locations, for the Warehouse→Location→Rack→Bin granularity in §8.2).
- **Cross-cutting**: global exception filter (consistent error envelope), response interceptor (consistent success envelope), global validation pipe, Swagger/OpenAPI at `/api/docs` (non-prod only), rate limiting (`@nestjs/throttler`, stricter on auth endpoints), helmet, CORS, health check.
- **Audit logging** (`apps/api/src/audit/`): explicit `AuditService.log()` calls at every meaningful mutation (create/update/permission-change/config-change/login/logout).
- **Seed script** (`prisma/seed.ts`): platform Super Admin (from env), and — non-production only — a demo tenant ("ABC Textile") with a working Company Owner login, one factory, one warehouse.
- **Shared packages**: `@abytetex/types` (RBAC enums, API envelope types) and `@abytetex/validation` (zod schemas for auth forms) for `apps/web` to consume later (D-017).
- **Docs**: `IMPLEMENTATION_DECISIONS.md` (18 decisions so far), this log, `docker-compose.yml` (Postgres/Redis/MinIO for local dev).

### Verified
- `prisma validate` / `prisma generate` — clean.
- `nest build` (full TS compile) — clean, zero errors.
- `eslint` — clean, zero warnings/errors.
- **Runtime, against a real local Postgres (user-installed; no Docker in this environment)**:
  - `prisma migrate dev --name init` applied cleanly to a fresh database.
  - `prisma:seed` created the platform Super Admin and the demo tenant ("ABC Textile") with a working Company Owner login, one factory, one warehouse.
  - API boots cleanly (`npm run dev:api`), all routes map, Swagger/health respond.
  - **Manually exercised over HTTP** (see D-015 for the two real bugs this caught and fixed): login (correct + wrong password), `/users/me`, tenant-scoped `/factories` list/create, platform-admin `/tenants` list, the full invite → welcome-email (logged, dev mode) → set-password → login → RBAC-restricted-request cycle for a freshly-invited VIEWER-role user (can VIEW, correctly gets 403 on CREATE), and the tenant/platform boundary in both directions (tenant user 403's on platform routes; platform admin 403's on tenant routes instead of silently reading tenant data).
  - Not yet exercised: departments/warehouses/locations CRUD (same code pattern as factories, not independently re-tested), role permission editing (`PUT /roles/:id/permissions`), rate limiting thresholds, refresh-token rotation/reuse detection, forgot-password.
  - Redis/BullMQ: still unconfigured/unstarted — nothing in Phase 1 uses it yet (see `REDIS_URL` in `.env`, currently pointed at a local default that hasn't been confirmed reachable).

### Problems found and fixed during this phase
- **Tenant context was silently never established** (guard-based `AsyncLocalStorage.enterWith()` doesn't survive Nest's RxJS interceptor pipeline) — every tenant-scoped query failed closed with a 403 until this was caught by manually testing `/users/me` and `/factories` over HTTP, not by any static check. Fixed by moving context establishment into an interceptor using `run()`. Full writeup in IMPLEMENTATION_DECISIONS.md D-015.
- **More seriously**: the original fix attempt included an `isPlatformAdmin` bypass in the Prisma extension that let a platform-admin-flagged token read tenant data straight through an ordinary tenant-scoped endpoint (`GET /factories/:id`) — confirmed by a live cross-tenant-access test before it was removed. This is exactly the class of bug SRS §22's "cross-tenant access is impossible" acceptance criterion exists to catch. Also documented in D-015.
- **`resetPassword` never activated `INVITED` accounts** — a newly invited user (or a newly provisioned tenant's Company Owner) could set a password successfully (204) but then get rejected at login with "Account is not active," permanently, since nothing transitioned `INVITED` → `ACTIVE`. Fixed to activate on first successful reset, while leaving `INACTIVE`/`LOCKED` accounts alone so a stale reset token can't be used to bypass an admin lockout. Caught by manually running the full invite-to-login cycle, not by any test that existed before this session.
- Prisma extensions preserve runtime tenant-injection but not the TypeScript input types for `create`/`update` — fixed by explicitly including `tenantId` in scalar creates (factories/departments/warehouses services) rather than relying on the extension alone for type-checking; see the comment at each call site.
- `@@unique([tenantId, code])` on `Role` doesn't prevent duplicate platform-level (`tenantId = null`) rows, since Postgres treats `NULL` as distinct — worked around in the seed script (check-then-create); documented as D-018.
- pnpm couldn't be activated via corepack (permission denied writing to `C:\Program Files\nodejs`) — switched to npm workspaces (D-001).

**Takeaway that shaped how the rest of this project should be verified going forward:** all of the above passed `prisma validate`, a full `nest build`, and a clean `eslint` run before a single one of these bugs was found. Compiling and linting clean is not evidence a multi-tenant security boundary actually holds — only exercising it over HTTP against a real database caught these. Every future module should get the same treatment (a real request against a real DB, including the "should this be rejected" cases) before being marked `Done` in REQUIREMENTS_TRACEABILITY.md, not just "compiles."

## 2026-09-12 — Phase 2 (partial): Master data APIs (Products, Materials, Customers, Suppliers)

### What was implemented
- `apps/api/src/products/` — Products CRUD (SRS §5.4.1 fields: SKU, code, name, category, unit, fabric type, GSM, width, color, shade, composition, brand, status) plus a small `ProductCategory` create/list sub-resource (parent/child hierarchy already existed in the schema; needed a usable endpoint).
- `apps/api/src/materials/` — Materials CRUD (SRS §5.4.2: type enum — yarn/cotton/chemical/dye/packing/accessory/consumable/other — code, name, unit, reorder level, status).
- `apps/api/src/customers/` — Customers CRUD (SRS §5.4.3: name, contact person, phone, email, address, tax number, payment terms, credit limit, status).
- `apps/api/src/suppliers/` — Suppliers CRUD (SRS §5.4.4: name, contact, phone, email, address, payment terms, rating; "supplier history" is served via the existing `purchaseOrders` relation on `getById`, not a stored field).
- All four follow the exact same pattern as Phase 1's factories/departments/warehouses: tenant-scoped via `prisma.db`, `tenantId` spelled out explicitly on create (see Phase 1 log entry for why), `@RequirePermission` per route, `AuditService.log()` on create/update, pagination + search on list.

### Verified
- `nest build` / `eslint` — clean.
- **Runtime, against the live demo tenant**: created a product category, a product (with the category correctly joined on list/get), a material, a customer, and a supplier; duplicate SKU correctly rejected with 409 Conflict. Update endpoints, category parent/child nesting, and supplier purchase-order history join not yet independently exercised (no purchase orders exist yet to join against).

### Open / Next
1. Frontend foundation (Next.js + Tailwind + shadcn/ui + TanStack Query + Zustand): auth pages, dashboard shell, role-aware navigation, and screens for everything built so far (tenant/factory/warehouse admin, master data CRUD).
2. Rest of Phase 2 (§20.1): machines, employees — machines/employees have schema + nothing else yet.
3. Phase 3: Sales, Procurement, Inventory, Production core workflows.
4. Get Redis reachable and wire `apps/worker` (BullMQ) once there's a real background job to run (report generation, notification dispatch) — nothing needs it yet.
5. Write automated tests (unit + e2e) covering what was so far only verified manually — the auth/RBAC/tenant-isolation flows above are exactly the kind of regression a future change could silently reintroduce.
