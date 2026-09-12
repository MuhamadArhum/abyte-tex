# Development Log

Reverse-chronological. Each entry: what shipped, what changed, what's still open.

---

## 2026-09-12 — Backend for every remaining core module (Phases 3–5)

At the user's request to "build all the modules," implemented the backend for everything that previously had schema-only support: Shifts, Machines, Employees, Attendance, Sales Orders, a shared Inventory ledger service, Procurement (Purchase Requests/Orders, Goods Receipts), Production (Process Routes, Production Orders, Batches, Material Consumption), Downtime, Quality (Inspection Templates, Inspections, Defects), Maintenance (Jobs, Preventive Schedules), Dispatch, Costing, Payroll, Notifications, and Dashboards (real aggregation queries, not placeholders).

### Architecture notes
- **`InventoryService` is the single point of truth for touching stock** (`apps/api/src/inventory/`). Procurement's goods receipt, Production's material consumption and batch output, and Dispatch all call through `recordMovement()`/`transferStock()` rather than writing `Stock`/`StockMovement` rows themselves — this is what SRS §8.3 ("stock shall never be changed silently") actually requires in practice, and it's also what caught the bug below.
- **Automatic corrective maintenance** (SRS §9.3): `DowntimeService.create()` checks the downtime category, and for MECHANICAL/ELECTRICAL (genuine breakdowns) auto-creates a `MaintenanceJob` (type CORRECTIVE, linked via `downtimeId`) and flips the machine to BREAKDOWN status — no separate trigger/queue needed, it's inline in the same transaction.
- Every `orderNumber`/`batchNumber`/etc. is generated server-side (`SO-000001`, `PRO-000001`, `BATCH-000001`, …) via a simple count-based sequence — documented as good-enough-for-MVP rather than a robust distributed sequence (race condition on concurrent creates is a known, accepted limitation at this scale).
- Sales/Purchase/Production order status changes are accepted for any value in the enum with no state-machine enforcement yet — see D-022. This was a deliberate scope cut, not an oversight.

### Verified — full end-to-end business cycle run against the live API and database
Not just unit-level checks: ran the actual operational chain a factory would follow, in order, against the running dev API:
1. Received 1000 KG of raw material into stock (manual RECEIVE).
2. Created a Sales Order (100 MTR, auto-computed subtotal/total correct).
3. Created a Production Order linked to that Sales Order.
4. Consumed 120 KG of material against the Production Order — confirmed the material stock balance actually decremented (1000 → 880).
5. Created a Production Batch, recorded its output (98 good / 2 wastage) — confirmed the *finished product* stock balance was correctly created via the linked `PRODUCTION_RECEIPT` movement.
6. Dispatched 98 units against the Sales Order — this is where a real bug was found (below).
7. Queried the Owner/Production/Inventory dashboards and confirmed the numbers reflected the exact activity above (98 units produced today, 880 KG raw material remaining, 1 pending sales order, etc.) — these are real Prisma aggregations, not mocked data.

### Bug found and fixed
**Dispatching (or any stock-out movement) without specifying a batch number created a phantom duplicate stock row instead of decrementing the real one, silently netting a product's visible stock to zero.** Production had tagged the 98-unit output with `batchNumber: 'BATCH-000001'`; the dispatch's ISSUE movement didn't specify a batch, and the original matching logic required an *exact* batch match (including matching `null` to `null`) — so it found no existing row, created a new one at `-98`, and the two rows summed to zero. A live dashboard query (`totalFinishedGoodsUnits: 0` right after producing 98 units) is what exposed it. Root-caused and fixed in `InventoryService.recordMovement`: an unbatched request now matches *any* existing row for that item (oldest first), only requiring an exact batch match when the caller actually names one. Re-verified with a fresh produce→issue cycle: the unbatched issue correctly drew down the named-batch row. Documented as D-023. The phantom row from the original repro was deleted from the demo tenant's data rather than left as misleading history.

### Also fixed along the way (caught by `tsc`/`eslint`, not runtime)
- The recurring "Prisma extension injects `tenantId` at runtime but the generated TS input types still require it explicitly" pattern from Phase 1 (D-015's addendum) recurred in `InventoryService`, `sales.service.ts`, `procurement.service.ts`, `downtime.service.ts` — same fix each time (spell out `tenantId` in the `data` object; narrow it to a local `const` before an async transaction closure, since TS discards property narrowing across a function boundary).
- A real TS compile error caught a genuine mistake before it shipped: `payroll.service.ts`'s upsert `create` block set `employeeId` explicitly *and* spread `...dto` (which also has `employeeId`) — harmless in this case since both were the same value, but TS's "specified more than once" error is exactly the kind of thing worth having as a hard compile failure rather than a silent no-op overwrite.

### Verified (build/lint)
`nest build` and `eslint --fix` run clean after every 2–3 module batch (not just once at the end) — this is what kept each round of fixes small and localized rather than one large end-of-session cleanup.

### Open / Next
1. Frontend UI for everything built in this entry — currently API-only. Given the size, prioritize Sales Orders and Production (the core operational modules SRS calls out) first.
2. Automated tests — still the single biggest gap. Two real bugs in two sessions (tenant-context/RBAC, now stock-matching) were both caught only by manual end-to-end runs; a regression suite covering these exact flows would catch a reintroduction automatically.
3. Sales/Purchase/Production order status transitions need real state-machine rules once validated against actual factory workflows (D-022).
4. HR: Attendance/Payroll UI, and the Employee/Machine/Shift master-data screens.
5. File uploads (§15.1), offline/PWA (§13), Abyte AI (§14) — all still out of scope, as previously documented.

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
1. Rest of Phase 2 (§20.1): machines, employees — machines/employees have schema + nothing else yet.
2. Phase 3: Sales, Procurement, Inventory, Production core workflows.
3. Get Redis reachable and wire `apps/worker` (BullMQ) once there's a real background job to run (report generation, notification dispatch) — nothing needs it yet.
4. Write automated tests (unit + e2e) covering what was so far only verified manually — the auth/RBAC/tenant-isolation flows above are exactly the kind of regression a future change could silently reintroduce.

---

## 2026-09-12 — Frontend foundation + full UI for every module built so far

### What was implemented
- **`apps/web` scaffolded**: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, shadcn/ui (built on Base UI, not Radix — this shadcn version's `DropdownMenuTrigger` etc. don't support `asChild`; see `buttonVariants`-based fix in `topbar.tsx`), TanStack Query, Zustand, react-hook-form. Read Next 16's bundled docs before writing any code — confirmed `middleware.ts` is renamed `proxy.ts` (same behavior) and checked the framework's authentication guide, which assumes Next.js itself owns sessions/cookies; that pattern doesn't apply here (see decision below).
- **Auth architecture — entirely client-driven, deliberately not using Next's server-side session APIs**: the API and the frontend are different origins (`:4000` vs `:3000`), so Next's `cookies()`/`proxy.ts` on the frontend can never see the API's httpOnly refresh cookie — only the browser can, via a credentialed `fetch`. `useAuthBootstrap` (runs once on app load) calls `POST /auth/refresh` (`credentials: "include"`) then `GET /auth/session` to establish the session in a Zustand store; `apiFetch` attaches the in-memory access token, and on a 401 does exactly one silent refresh-and-retry before clearing the session. Verified for real: simulated the exact browser request (`Origin: http://localhost:3000`, credentialed) against the live API and confirmed `Access-Control-Allow-Origin` (the specific origin, not `*` — required for credentials to work at all), `Access-Control-Allow-Credentials: true`, and the `Set-Cookie` for the refresh token all come back correctly.
- **`GET /auth/session` added to the API** (`apps/api/src/auth/auth.controller.ts`) — returns the same computed permission set (`allow`/`deny`/`roleCodes`/`factoryIds`) JwtStrategy already builds per-request, with no extra DB query. This is the frontend's single source of truth for "what can this user do."
- **RBAC-aware UI**: `useAuthStore().can(resource, action)` mirrors the API's `PermissionsGuard` exactly, including giving platform admins **no** bypass on tenant-resource permissions (matching the bug fix from the previous phase) — a control the API would 403 on is not shown, rather than shown-then-fails.
- **Shared primitives** (`components/shared/`): `DataTable` (loading/empty states built in), `PaginationBar`, `PageHeader`, `ConfirmDialog`, `StatusBadge`, `PermissionGate` (client-side convenience only — the API is still the real boundary).
- **Full CRUD UI** for every backend module built so far: Products (+ categories), Materials, Customers, Suppliers, Factories (with tabbed Departments/Warehouses/Warehouse-Locations management on a detail page), Users (invite → role/factory checklists → edit), Roles (a full Resource×Action permission matrix, with Company Owner correctly locked read-only), Company Settings, and a separate Tenants console for platform admins (provision tenant → status changes).
- **Auth pages**: login, forgot-password, reset-password (handles both "forgot my password" and "set my first password from an invite" — same backend endpoint, same page).

### Verified
- `tsc --noEmit`, `eslint`, and a full `next build` (production, all 14 routes: 13 static + 1 dynamic `/factories/[id]`) — all clean.
- All 13 top-level routes return 200 from the running dev server with no server-side errors in the logs.
- The exact cross-origin, credentialed request/response cycle the browser will perform (login → Set-Cookie → session fetch) was replayed with `curl -H "Origin: http://localhost:3000"` against the live API and confirmed correct.
- **Not verified**: actual rendering and interaction in a real browser. No browser automation tool was available in this session (the Chrome extension prompt was declined). Static analysis, the build, and the server-side/API-contract checks above are strong signals but are not a substitute for actually clicking through the app — treat the UI as unverified for visual/interaction bugs (layout issues, a broken click handler, etc.) until someone opens it in a browser.

### Open / Next
1. Automated tests (still none, frontend or backend) — see the bug found below for exactly why this matters.
2. Phase 3 backend + UI: Sales, Procurement, Inventory, Production.
3. Dashboards/reports (§12) — the current dashboard home is just quick-links, not the KPI dashboards the SRS describes; those need real aggregation endpoints first.

---

## 2026-09-12 — Actual browser verification (Playwright) + one real bug found and fixed

The previous entry flagged "not clicked through in a real browser" as the top open item. No browser automation tool was available in-session (the user declined the Chrome extension install), so this was done a different way: installed Playwright + headless Chromium ad hoc (`npx playwright install chromium`, `npm install --no-save playwright`) and drove the actual running app (`localhost:3000`) against the actual running API (`localhost:4000`) with real scripts, capturing console errors, failed requests, and screenshots.

### What was verified, for real, in a rendered browser
- Login (correct + wrong password), full dashboard render with correct role-aware sidebar for a Company Owner.
- Every list page (Products, Materials, Customers, Suppliers, Factories, Users, Roles, Company Settings) renders with correct labels and live data.
- Factory detail page navigation, and its Overview/Departments/Warehouses tabs.
- Creating a Customer through the actual Sheet form, seeing it appear in the list, and re-opening it pre-filled for edit.
- Client-side required-field validation on the Product form (submit empty → inline errors, no request sent).
- RBAC in the actual rendered UI: a VIEWER-role user sees the same nav as Company Owner (by design — Viewer has read-only access to everything, including Users/Roles) but the "Add Product" button is correctly absent from the Products page.
- Visual quality: screenshots confirm a clean, professional layout — sidebar, tables, badges, form sheets all rendering as designed, not a "generated dashboard" look.

### Bug found and fixed
**Creating a Customer/Supplier/Factory with the optional email field left blank failed with a 400** ("email must be an email"). Root cause: react-hook-form reports an untouched optional text input as `""`, not `undefined`; the API's `@IsOptional() @IsEmail()` only treats `null`/`undefined` as "not provided," so `""` reached `@IsEmail()` and failed it. This was invisible to `tsc`, `eslint`, and `next build` — only surfaced by actually submitting the form. Fixed centrally in `apiFetch` (`apps/web/src/lib/api-client.ts`): every request body now has empty-string values converted to `undefined` before being sent, which fixes this for every current form and any future one, and incidentally stops other optional fields from storing `""` instead of `null`. Re-verified after the fix: Customer, Supplier, and Factory creation with blank optional fields all succeed. Documented as D-021.

### Takeaway
This is the second time in this project that "compiles, lints, and builds clean" turned out not to mean "works" — the first was the tenant-context/RBAC bugs in Phase 1. Both were caught only by actually running the software (against a real DB, in a real rendered browser) and trying the exact thing a user would do. This reinforces the standing rule for this project: a feature isn't `Done` in the traceability doc until it's been exercised, not just built.

---

## 2026-09-13 — Frontend UI for every remaining backend module

The Phase 3–5 backend modules (Sales, Procurement, Production, Inventory, Dispatch, Quality, Maintenance, Machines, Employees, Attendance) had been API-only since the 2026-09-12 backend push. Built the frontend for all of them in one batch.

### What was implemented
- **Sales**: list + multi-line-item create form (product select auto-fills unit, computes total client-side); detail page with items table and a status-change dropdown.
- **Procurement**: list + multi-item create form; detail page with an inline "Receive Goods" sheet (per-item received/accepted/rejected quantities against remaining balance).
- **Production Orders**: list + create form; detail page with Start Batch, Record Output (optional receiving warehouse), and Record Material Consumption sheets — all wired to the same `InventoryService`-backed endpoints verified against the live DB in the prior session.
- **Inventory**: a single page with Stock Levels / Movement Ledger tabs (filterable by factory→warehouse), plus manual Record Movement (RECEIVE/ISSUE/ADJUSTMENT/RETURN, sign derived server-side) and Transfer sheets.
- **Dispatch**: create form selects a sales order and surfaces only its undelivered items for quantity entry, mirroring the Goods Receipt pattern.
- **Quality**: inspection form covering the textile-specific fields (GSM, width, shade, roll length, weight, color variation, stitching defects) plus a repeatable defects list (type/severity/quantity).
- **Maintenance**: job creation (preventive) + a status-change dropdown (OPEN → IN_PROGRESS → COMPLETED/CANCELLED) that also stamps startedAt/completedAt.
- **Machines, Employees, Attendance**: standard list + create/edit patterns matching the rest of the app; Attendance additionally has a mark-attendance sheet with check-in/check-out time inputs.
- **Dashboard home rewritten**: the six real dashboard-aggregation endpoints (Owner/Production/Machine/Inventory/Quality/Maintenance) are now rendered as tabbed `StatCard` grids instead of the previous quick-links-only home page.
- New shared `StatCard` component (`components/shared/stat-card.tsx`) for the dashboard grids.

### Verified
- `tsc --noEmit`, `eslint`, and a full `next build` — all clean, all 26 routes (18 static, 3 dynamic detail pages, plus the pre-existing auth/admin routes) compile and prerender successfully.
- **Not yet verified**: actual rendering/interaction in a real browser. The 2026-09-12 Playwright pass only exercised Phase 1–2 screens; per the standing takeaway above, this batch is not "done" until it's been clicked through the same way — this is the immediate next step.

### Open / Next
1. Browser-test this batch with Playwright the same way Phase 1–2 was tested, watching specifically for the kind of bug that static analysis can't catch (D-021, D-023 were both this way).
2. Frontend UI for Costing and Payroll (still API-only).
3. Automated tests — still none.

---

## 2026-09-13 — Browser-tested the new UI batch; found and fixed a fourth real, static-analysis-invisible bug (D-024)

Followed through on the open item above: started both dev servers against the live demo tenant and drove every new page (Sales, Procurement, Production Orders, Inventory, Dispatch, Quality, Maintenance, Machines, Employees, Attendance) with headless Playwright, logged in as the Company Owner.

### What was verified
- All 10 new/updated list pages render with no console errors, no failed/4xx-5xx requests, and correct empty states against the live DB.
- Sheet/dialog forms open correctly (Record Movement, Transfer, Goods Receipt, dispatch item picker, defect rows, etc.).
- Detail-page navigation for Sales Orders, Production Orders, and Purchase Orders (initially looked like a nav failure — turned out to be the same Turbopack first-compile timing artifact noted in the 2026-09-12 entry, resolved the same way: `page.waitForURL()` instead of a fixed timeout).

### Bug found and fixed (D-024)
**Every dynamic `<Select>` in the app displayed the raw foreign-key ID instead of its label once an item was actually picked** — e.g. choosing "Factory 01" left the trigger showing `cmtyfzein001rwakt5k1jqyrd`. Root cause: this project's Base UI-based `SelectValue` only auto-resolves a label from an `items` prop passed to `Select.Root`; nobody here passes that prop (every select is built the JSX-children way), so `SelectValue` silently fell back to stringifying the raw controlled value. Invisible to `tsc`/`eslint`/`next build` because the *submitted* value was always correct — this was a pure display bug — and invisible in every enum-valued select (status/type/outcome) because those enums' item children happen to equal their own value, masking the identical defect. Confirmed this predates this session too: `features/products/product-form.tsx`'s category select (built and "browser-tested" in the very first Phase 1–2 Playwright pass) had the exact same bug, just never noticed because that specific field's post-selection text wasn't checked.
Fixed at every call site (~20 files) by passing the resolved label explicitly as `<SelectValue>`'s children — `<SelectValue placeholder="...">{list.find((x) => x.id === selectedId)?.name}</SelectValue>` — which `SelectValue` already prefers over its own (broken, for this codebase's usage pattern) auto-resolution. Verified with a scripted pass that opens every affected select on every affected page and asserts the trigger text is never a raw ID: 10/10 pages pass.

### Takeaway
This is the fourth real bug in this project (after D-015's tenant-isolation gap, D-021's blank-email validation, and D-023's phantom stock row) caught only by actually running the software — and the most widespread yet, since it silently affected essentially every foreign-key-referencing dropdown in the entire application, old and new. The pattern holds: "compiles, lints, and builds clean" keeps meaning "type-correct," not "correct." Reinforces the standing rule — a feature isn't `Done` until someone has actually looked at what it renders after a real interaction, not just that the request succeeded.
