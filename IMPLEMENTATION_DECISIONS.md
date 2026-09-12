# Implementation Decisions

Tracks engineering decisions made where the SRS is silent or leaves room for interpretation. Each entry: the decision, why, and the SRS section it relates to.

---

## D-001 — Monorepo tooling: npm workspaces (not pnpm)
**SRS ref:** §19 Recommended Repository Structure, §17.3–17.4
**Decision:** Use npm workspaces instead of pnpm/turborepo.
**Why:** SRS doesn't mandate a package manager. pnpm requires global install via corepack, which failed in this environment due to a permission restriction on `C:\Program Files\nodejs`. npm workspaces ships with Node and satisfies the same `apps/*` + `packages/*` layout with no functional loss for an initial modular monolith.

## D-002 — Repository layout matches SRS §19 exactly
**SRS ref:** §19
**Decision:** `apps/{web,api,worker}`, `packages/{types,validation,config}`, `prisma/`, `infra/{docker,nginx,scripts}`, `docs/`.
**Why:** SRS gives this structure explicitly — followed as specified. `apps/mobile` is stubbed as empty/deferred (Phase 2/3, React Native + Expo per §23).

## D-003 — Prisma schema lives at repo root `prisma/schema.prisma`, not inside `apps/api`
**SRS ref:** §19, §17.1
**Decision:** Single shared Prisma schema at the root, with `@prisma/client` generated into `packages/types` consumers and imported by `apps/api` and `apps/worker`.
**Why:** SRS's recommended tree shows `prisma/` at root, sibling to `apps/`, implying it's shared infrastructure, not API-internal. This also lets the worker app use the same generated client without duplicating schema.

## D-004 — Full data model designed up front; APIs/UI built incrementally per roadmap phase
**SRS ref:** §17.1, §20 Development Roadmap
**Decision:** The complete Prisma schema (all domains: platform/tenancy, commercial, production, inventory, quality/maintenance, workforce, finance/logistics, platform services) is authored in Phase 1, even though only Phase 1–2 scope gets working APIs/UI immediately.
**Why:** Schema relationships (tenant scoping, FKs, traceability chains like Sales Order → Production Order → Batch → Quality Inspection) cut across every module. Designing it piecemeal risks retrofitted migrations that violate §17.2 (foreign keys/indexes throughout, tenant-scoped unique constraints). Building it once, correctly, is cheaper than iterative schema surgery.

## D-005 — Tenant isolation enforced via mandatory `tenantId` scoping in a Prisma middleware/service layer, not Postgres RLS
**SRS ref:** §3.3 Tenant Data-Isolation Rules, §16.1
**Decision:** Every tenant-scoped Prisma model requires `tenantId`; a `PrismaService` wrapper (or Prisma Client Extension) auto-injects `tenantId` from request context (`AsyncLocalStorage`/Nest request-scoped provider) into every query, and rejects queries missing tenant context outside explicitly whitelisted platform-level operations.
**Why:** SRS mandates tenant_id resolved server-side from session, never client input, and forbids trusting frontend-supplied tenant IDs (§3.3). Postgres RLS is a valid alternative but adds operational complexity (role-switching per request) not called for by the SRS's "single PostgreSQL database... strict logical isolation enforced in the application and data layers" (§3.2) — application-layer enforcement is the explicit direction.

## D-006 — Auth: JWT access + refresh tokens, argon2 password hashing
**SRS ref:** §5.1, §16.1
**Decision:** Short-lived JWT access token + longer-lived rotating refresh token (httpOnly secure cookie), argon2id for password hashing.
**Why:** SRS requires "secure password hashing," "secure cookies/tokens," and lists 2FA/SSO/passkeys as explicit future work — implying username/password + token session is the MVP baseline. argon2id is the current industry-recommended default over bcrypt.

## D-007 — RBAC: static role catalog (per §4.1) + dynamic per-user permission overrides
**SRS ref:** §4.1, §4.2
**Decision:** Roles table seeded with the exact role list from §4.1 (platform: Super Admin, Support Admin; tenant: Company Owner, Company Admin, Factory Manager, Production Manager, Production Supervisor, Machine Operator, Quality Manager, Inventory Manager, Purchase Manager, Maintenance Manager, HR Manager, Accountant, Sales Manager, Viewer). Permissions are `(role, resource, action)` tuples across the 8 actions in §4.2, with an optional `UserPermissionOverride` table for per-user exceptions.
**Why:** §4.2 explicitly says permissions are assignable "per role and, where required, per user" — this requires the override table, not just role-based checks.

## D-008 — Factory-level access is a many-to-many `UserFactoryAccess`, not a single field
**SRS ref:** §5.1 "Factory access management", §5.3 (multi-factory companies)
**Decision:** Users can be granted access to a subset of factories within their tenant, not just their whole company.
**Why:** §5.1 explicitly lists "Factory access management" as a distinct capability, and §5.3 establishes that a company may run multiple factories — a Factory Manager for Factory 01 should not automatically see Factory 02.

## D-009 — Soft deletion via `deletedAt` timestamp, applied selectively
**SRS ref:** §17.2 "Avoid unnecessary hard deletion; use soft deletion where required."
**Decision:** Soft-delete (`deletedAt` nullable timestamp) on business records that have downstream references or audit value (Products, Materials, Customers, Suppliers, Machines, Employees, Sales/Purchase Orders). Pure lookup/config tables may hard-delete.
**Why:** SRS says "where required," not universally — applying it everywhere would bloat every query with delete filters for no benefit on disposable config data.

## D-010 — Background jobs via BullMQ + Redis from Phase 1, even though only used lightly at first
**SRS ref:** §16.2, §17.5, §23
**Decision:** `apps/worker` and the BullMQ/Redis wiring are scaffolded in Phase 1 alongside the API, even though the first real background jobs (report generation, notification dispatch) land in later phases.
**Why:** SRS names Redis + BullMQ as fixed parts of the final stack (§23) and requires "large reports... processed through background jobs" (§16.2) — cheaper to wire the queue infrastructure once than retrofit it later.

## D-011 — Offline sync (§13) deferred to its dedicated roadmap phase (Phase 6), but the sync-event data shape is reserved in the schema now
**SRS ref:** §13, §17.1 (SyncEvent entity), §20.1 (Phase 6 — Offline)
**Decision:** A `SyncEvent`-shaped table/fields are reserved in Phase 1 schema design, but the actual PWA/IndexedDB/service-worker/conflict-resolution engine is not built until the dedicated Offline phase.
**Why:** SRS's own roadmap sequences offline as Phase 6, after core operations exist to sync in the first place. Building sync before there's anything meaningful to sync would be wasted, unvalidated work.

## D-013 — `User.email` is globally unique, not unique-per-tenant
**SRS ref:** §5.1, §17.1 (User entity)
**Decision:** One email = one user account across the whole platform; a person working with two different tenant businesses needs two accounts (or, later, a tenant-switcher on top of a shared identity — not built now).
**Why:** Keeps login a single `findUnique({ email })` with no tenant-selection step, and SRS's login flow (§5.1) doesn't describe a "pick your company" screen. Revisit only if a real pilot factory needs one person spanning two tenants.

## D-014 — `tenantId` is denormalized onto every independently-queried entity, not onto pure child line-items
**SRS ref:** §3.3 ("Every business-related record shall be tenant-scoped, carrying at minimum: tenant_id...")
**Decision:** Aggregate-root/business entities (Order, Batch, Machine, Employee, Downtime, StockMovement, etc.) carry `tenantId` directly and are covered by the automatic tenant-scoping Prisma extension (see `apps/api/src/prisma/tenant-scoped-models.ts`). Pure child line-items with no independent lifecycle (`SalesOrderItem`, `PurchaseOrderItem`, `GoodsReceiptItem`, `DispatchItem`, `Defect`, `PayrollEntry`, `MaterialConsumption`, RBAC join tables) do **not** carry their own `tenantId` — they inherit tenant scope from their parent FK.
**Why:** Read literally, §3.3 would denormalize `tenant_id` onto every table including junction/line-item rows, doubling write paths for no real isolation benefit (a line item is only ever reached through its parent). The isolation guarantee still holds: any query against a child table must join through its tenant-scoped parent — see D-015 for how this is enforced. Revisit if a pilot factory needs to query line-items independently of their parent at scale (e.g., a cross-order "all dispatch items this week" report) — at that point, add `tenantId` to that specific table rather than all of them pre-emptively.

## D-015 — Tenant isolation is enforced via a Prisma Client Extension + AsyncLocalStorage request context, not per-query manual filtering
**SRS ref:** §3.3, §16.1 (defense against IDOR/BOLA)
**Decision:** `apps/api/src/prisma/prisma.service.ts` wraps the Prisma Client in a `$extends` query extension. On every query against a model listed in `TENANT_SCOPED_MODELS`, it merges the current request's `tenantId` (read from an `AsyncLocalStorage`-backed `TenantContextStore`) into `where` (reads/updates/deletes) or `data` (creates) — overriding, not trusting, any client-supplied value. Queries against child tables (D-014) must filter through their tenant-scoped parent relation (e.g. `salesOrderItem.findMany({ where: { salesOrder: { tenantId } } })`); this is a code-review convention, not schema-enforced, since Prisma extensions operate per top-level model call and can't see through relation filters generically. Platform-level operations that legitimately need cross-tenant access (tenant provisioning) go through a separate, explicitly-named unscoped client path (`PrismaService.raw`), used only in the `tenants` module and gated by `PlatformAdminGuard`. Platform admins get **no automatic bypass** on `.db` — a platform-admin-flagged request against a tenant-scoped model via the scoped client is rejected (no `tenantId` to scope by), not silently shown everything; `PermissionsGuard` mirrors this — no platform-admin bypass on tenant-resource permissions either — see the "found and fixed" note below for why that mattered in practice.
**Why:** Manual "remember to add `where: { tenantId }` in every service method" is exactly the failure mode that causes cross-tenant data leaks (a single forgotten filter = a BOLA vulnerability). An extension that auto-injects tenant scope for every top-level call on a tenant-scoped model is defense-in-depth: even a service method that forgets an explicit filter still can't cross tenant boundaries for the models covered.
**Found and fixed during Phase 1 runtime verification (2026-09-12):** the context-establishment mechanism went through two implementations before this worked correctly.
1. First attempt: a global **guard** (`TenantContextGuard`) called `TenantContextStore.enterWith()` right after JWT auth. This looked correct and even logged the right values at the call site — but by the time the Prisma extension ran (inside the controller → service → Prisma call chain), `TenantContextStore.get()` came back empty. Root cause: guards run *before* Nest's RxJS-based interceptor/handler pipeline, and Nest does not subscribe to the resulting Observable synchronously within a guard's call stack — so the "current execution context" `enterWith` mutated had already unwound by the time the controller method actually executed. Every tenant-scoped query failed closed with "attempted with no request context" (fails closed, so no data leaked — but nothing worked either).
2. Fix: moved context establishment into an **interceptor** (`TenantContextInterceptor`), which wraps `next.handle().subscribe(subscriber)` *inside* `TenantContextStore.run()` rather than calling `enterWith()`. Because the actual subscription (which triggers the controller method) happens synchronously inside the `run()` callback, the AsyncLocalStorage context correctly follows every `await` from there through services and into Prisma. `PermissionsGuard` and `PlatformAdminGuard`, which still run as guards (before interceptors), were changed to read straight off `request.user` (set earlier by `JwtStrategy`) instead of the store — they never needed the ALS context in the first place, they just needed to run after JWT auth, which guards already guarantee.
3. A **second, more serious bug** was caught by the same manual test pass: the original guard-based extension code had a `if (ctx.isPlatformAdmin) return query(args)` early-return, intended as "platform admins just see their own (null) tenant." In practice this bypassed tenant filtering *entirely* for any platform-admin-flagged request that reached a tenant-scoped model through the ordinary scoped client — confirmed by a live test where a platform Super Admin token successfully fetched a tenant's factory through `GET /factories/:id`, an endpoint meant only for that tenant's own users. This directly contradicted the MVP acceptance criterion "cross-tenant access is impossible" (SRS §22). Fixed by removing the bypass: platform admins have no `tenantId`, so they now fail closed on every tenant-scoped `.db` call, and only reach tenant data through the explicit `.raw` path in the `tenants` module.
This is the reason the tracking docs distinguish "compiles/lints clean" from "verified against a live database" — the first two rounds of this exact code passed every static check and still leaked data at runtime.

## D-016 — MailService uses SMTP when configured, logs-instead-of-sends otherwise
**SRS ref:** §5.1 (password reset), §12.7 (email notification channel)
**Decision:** `apps/api/src/mail/mail.service.ts` sends via nodemailer/SMTP when `SMTP_HOST` is set; when unset (fresh local dev checkout, no mail server available), it logs the rendered email at `warn` level instead of throwing or silently dropping it.
**Why:** Password reset and notification emails are real required functionality, not something to fake — but this environment has no SMTP server provisioned, and forcing one to exist before the API can boot would block all other development. The fallback is a transport choice (where does the email go), not a stubbed business rule (what the email says or when it's sent) — logging instead of sending is a legitimate, clearly-labeled dev-mode behavior, not dummy functionality. Wire real SMTP credentials before pilot deployment.

## D-017 — `packages/types` and `packages/validation` are consumed by `apps/web`, not `apps/api`
**SRS ref:** §19 Recommended Repository Structure
**Decision:** The shared workspace packages point `main`/`types` straight at their TypeScript source (`src/index.ts`) — the standard pattern for Next.js monorepos, since Next's compiler transpiles workspace packages directly (via `transpilePackages` in `next.config.js`). NestJS's build (`nest build` / ts-loader) does not resolve bare TS source from `node_modules` as smoothly, so `apps/api` does not depend on these packages; the backend's RBAC constants, DTOs, and Prisma-generated types are its own source of truth, and `packages/types` re-exports the same enum *values* by hand for the frontend rather than importing across the app/api boundary.
**Why:** Avoids sinking Phase 1 time into monorepo build tooling (a compiled-dist step with watch mode for every shared package) for packages nothing in the backend currently needs. Revisit if the API ever needs to import shared code — at that point give the shared packages a real `tsc` build step and reference the compiled `dist`, not the TS source, from `apps/api`.

## D-018 — Platform-level roles (`tenantId = null`) rely on application-level "check then create," not the DB unique constraint
**SRS ref:** §4.1
**Decision:** `Role.@@unique([tenantId, code])` does not actually prevent duplicate `SUPER_ADMIN`/`SUPPORT_ADMIN` rows, because Postgres treats every `NULL` as distinct for uniqueness purposes. `prisma/seed.ts` guards against duplicates itself (`findFirst` then `create`), and no other code path creates platform-level roles — the API only ever creates tenant-scoped roles (`seedTenantRoles`, always called with a real `tenantId`).
**Why:** A real fix (a partial unique index `WHERE "tenantId" IS NULL`) needs a hand-written SQL migration, since Prisma's schema DSL can't express partial indexes directly. Not worth doing before the first real migration exists — revisit by adding that partial index in the initial `prisma migrate dev` migration's SQL if platform-role provisioning ever moves off the one-time seed script.

## D-019 — Frontend auth is entirely client-driven; Next.js's own session/cookie APIs are not used
**SRS ref:** §17.3–17.4 (separate NestJS backend + Next.js frontend)
**Decision:** `apps/web` never uses Next's `cookies()`, `proxy.ts` (Next 16's renamed `middleware.ts`), or Server Actions for auth. Instead: a Zustand store holds the access token in memory; `useAuthBootstrap` (runs once client-side on app load) trades the API's httpOnly refresh cookie for a new access token via a credentialed `fetch` to `POST /auth/refresh`, then fetches `GET /auth/session` for the permission set; `apiFetch` attaches the token to every request and does one silent refresh-and-retry on a 401.
**Why:** Next's official authentication guide (bundled in `node_modules/next/dist/docs`, read before writing this) assumes Next.js itself issues and reads the session cookie on its own origin. That doesn't apply here: the API and the frontend are different origins in dev (`:4000` vs `:3000`, and will be different subdomains/services in production per SRS §17.5's Nginx-fronted architecture), so a cookie the API sets is invisible to Next's server-side `cookies()` or `proxy.ts` — only the browser holds it, and only a credentialed `fetch` from client-side JS can use it. Verified this actually works end-to-end by replaying the exact cross-origin request the browser will make (`curl -H "Origin: http://localhost:3000" --cookie-jar`) against the live API and confirming `Access-Control-Allow-Origin` names the specific origin (required for `Access-Control-Allow-Credentials: true` to be honored — a wildcard origin would silently break this).

## D-020 — shadcn/ui in this project is built on Base UI, not Radix — no `asChild` prop
**SRS ref:** §17.4
**Decision:** The `shadcn` CLI version used here scaffolds components on `@base-ui/react` rather than Radix UI. Polymorphic composition (e.g. rendering a `DropdownMenuTrigger` as a styled `Button`) does not use Radix's `asChild` pattern — Base UI's trigger primitives don't accept it. Fixed by applying `buttonVariants({...})` classes directly to the trigger element instead of wrapping a `<Button asChild>` child (see `apps/web/src/components/layout/topbar.tsx`).
**Why:** Caught by `tsc`, not by assumption — `asChild` produced a real type error, which is exactly the kind of "looks like the Next.js/shadcn you know but isn't" gap the training data wouldn't predict for a bleeding-edge scaffold. Keep this in mind before copying Radix-era shadcn examples from memory or the web into this codebase; check the actual generated component's prop signature first.

## D-012 — Abyte AI (§14) is out of scope for current implementation
**SRS ref:** §14, §20.3 (Phase 2 roadmap item)
**Decision:** Not implemented now.
**Why:** SRS explicitly scopes it to Phase 2 of the roadmap, after MVP.
