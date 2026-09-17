# AbyteTex — Complete System Audit

**Date:** 2026-09-17
**Auditors:** Lead Software Architect / Senior QA Engineer / ERP Domain Auditor / Security Engineer / Production Readiness Engineer (multi-stream read-only audit)
**Scope:** Full repository at `D:\abyte-tex` against `AbyteTex_SRS_v1.0.docx` (SRS v1.0, 11-Sep-2026 baseline), the NestJS backend (`apps/api`), Next.js frontend (`apps/web`), worker scaffold (`apps/worker`), Prisma schema (57 models), and supporting infra.
**Method:** The SRS was extracted and read in full (24 sections). Eight parallel, independent, read-only audit passes were then run against the live codebase — Multi-Tenancy/RBAC/Auth, Inventory Integrity, Business Workflows, Database/Prisma, API enumeration, Frontend, general Security, and Worker/Production-Readiness — each producing findings verified by direct code reading (file/line citations), not by trusting `DEVELOPMENT_LOG.md`'s self-reported status. Where two audit streams reached different conclusions about the same underlying code (noted explicitly below), this document states the reconciled, re-derived conclusion rather than picking one arbitrarily.
**No code was changed, no migrations were run, no data was modified or deleted as part of this audit.**

---

## 1. Executive Summary

AbyteTex is a substantial, largely-functional, single-developer-session-built (per `DEVELOPMENT_LOG.md`) multi-tenant textile ERP. The breadth of implementation is genuinely impressive: 57 Prisma models covering all 32 SRS-named core entities, 139 API endpoints across 28 controllers, and a working CRUD frontend for every one of the ~24 business modules. CRUD-complete, however, is not the same as SRS-complete, and this audit's central finding is that **the gap between "the data can be created" and "the business process is actually enforced and safe" is large and consistent across almost every module.**

**105 findings** were confirmed across all nine audit streams (Multi-Tenancy, RBAC, Authentication, Inventory Integrity, Business Workflows, Database/Prisma, API, Frontend, general Security, and Worker/BullMQ + Production Readiness). Of these:

- **10 are P0** (security/data-corruption/system-breaking) — including a **live, confirmed cross-tenant data leak** on the Quality Dashboard (TEN-001), a **factory-level access control that is computed but never checked by any service** (RBAC-001), **quality inspection outcomes (Reject/Hold) that block nothing** — a batch that fails inspection can still be dispatched to a customer today (WF-015), and **four database-schema integrity gaps** including a stock-ledger uniqueness constraint that does not actually prevent duplicate balance rows under concurrent writes (DB-001–004).
- **32 are P1** — dominated by one theme: **none of the seven core business lifecycles (Sales, Purchase, Production, Goods Receipt, Dispatch, Quality, Maintenance) enforce any state-transition rules.** Every status field is a freely-settable enum. This was previously logged as a narrow, deliberate scope cut (D-022, scoped to three modules); this audit confirms it is broader — it applies to all seven — and, more importantly, shows the downstream consequences are not cosmetic (a Sales Order can jump Draft→Completed with nothing ever produced or shipped; a Dispatch can be created and stock physically issued against an order still in Draft status). The remaining P1s split across non-atomic inventory writes, four database-integrity gaps, frontend validation/confirmation gaps, and the missing worker/CI/CD/deployment/backup infrastructure (§14/§17).
- **34 are P2**, **29 are P3/technical debt.**

**The single most load-bearing engineering decision in this codebase — the `InventoryService` single-source-of-truth pattern for stock — genuinely holds.** No module writes to `Stock`/`StockMovement` directly; every mutation path goes through `recordMovement()`/`transferStock()`. This is confirmed correct by independent review. What is **not** solid is atomicity around it: Goods Receipt, Dispatch, and Production batch-output/consumption each perform their business-record write and their inventory-ledger write as **separate, independently-committing operations**, not one transaction (API-001–004). A mid-request failure in any of these — a plausible, ordinary failure mode, not an edge case — leaves the business document and the stock ledger disagreeing, silently.

**Multi-tenancy fundamentals are also genuinely solid** — the `AsyncLocalStorage` + Prisma Client Extension design correctly prevents cross-tenant IDOR-by-ID-guessing, not just cross-tenant list leakage, and the historically-fixed platform-admin-bypass bug (D-015) was independently re-verified as still fixed. The one confirmed live leak (TEN-001) is narrow and specific — a single unscoped `.raw` query on a Dashboard aggregation — not evidence the architecture itself is broken.

**Automated test coverage is zero**, confirmed independently by every audit stream. Two real bugs already found and fixed in this project (D-015 tenant-context, D-023 phantom stock row) were both caught only by manual, ad-hoc exercising of the running system — not by any regression suite — and this audit found the same bug *class* recurring in at least three places that D-015/D-023's fixes did not cover (TEN-001, DB-002/INV-007, API-001/002). This is the clearest, highest-leverage gap in the project: nothing currently prevents a future change from silently reintroducing any bug this audit found.

**Of the SRS's own 25 MVP acceptance criteria (§22)**, this audit assesses **10 as fully met, 9 as partially met, and 6 as missing or actively failing** — including the criterion the SRS itself singles out for emphasis: *"Cross-tenant access is impossible"* (see TEN-001) and *"Critical security tests pass, including cross-tenant isolation"* (no automated tests exist at all). Offline/PWA capability — explicitly listed inside the MVP scope group in SRS §20.2, not just Phase 2 — does not exist in any form (no service worker, no IndexedDB, no sync engine), which is a direct conflict between the SRS's own MVP definition and `DEVELOPMENT_LOG.md`'s documented decision to treat it as out of scope; this conflict should be resolved explicitly by the product owner, not left implicit.

**Bottom line:** AbyteTex is not production-ready today, but it is much closer to being ready than a project with zero real architecture would be. The core patterns (tenant isolation, inventory ledger, RBAC model, audit logging) are fundamentally sound and mostly need *hardening and enforcement gaps closed*, not a rewrite. The recommended path (§25) is a P0 fix pass (roughly 1–2 weeks of focused work, all narrowly scoped) followed by a state-machine/transaction-atomicity pass across every business workflow (the P1 list, larger but mechanically similar work repeated across seven modules) before any pilot-factory rollout.

---

## 2. Current System Status

**What exists and works, confirmed by direct code review (not just `DEVELOPMENT_LOG.md`'s claims):**

- Full monorepo scaffold matching SRS §19 exactly (`apps/{web,api,worker}`, `packages/{types,validation,config}`, `prisma/`, `infra/`).
- 57-model Prisma schema, `prisma validate` clean, migrations in sync with the live dev database, zero drift.
- 139 REST endpoints across 28 NestJS controllers, all under `/api/v1`, all DTO-validated, all Swagger-documented (minimally).
- Multi-tenant isolation via `AsyncLocalStorage` + Prisma Client Extension — confirmed structurally sound.
- 16-role, 8-action RBAC model, fully cataloged; per-user overrides and per-factory access are *modeled* but the latter is not enforced (RBAC-001).
- JWT + rotating opaque refresh tokens, argon2id hashing, audit logging on most (not all) mutations.
- Full CRUD frontend (Next.js 16 / React 19) for all ~24 business modules, with consistent loading/empty states, universal cache invalidation, and no flash-of-unauthenticated-content bugs.
- Working end-to-end business cycle (raw material receive → sales order → production order → material consumption → batch output → dispatch → dashboard reflection) has been manually verified against a live dev database per `DEVELOPMENT_LOG.md`, and this audit's findings are consistent with — not contradictory to — that basic cycle working.

**What is confirmed broken, missing, or unverified (headline items; full detail in the numbered sections below):**

- Cross-tenant data leak on one dashboard query (P0, TEN-001).
- Factory-level access control is entirely unenforced (P0, RBAC-001).
- Zero of seven business-object lifecycles enforce status transitions (P0/P1, WF-001 through WF-019).
- Quality Reject/Hold outcomes block nothing downstream (P0, WF-015).
- Multiple stock-affecting operations are not transactional (P0/P1, API-001–004, INV-001).
- A stock-ledger uniqueness constraint does not hold under concurrent writes with null location/batch (P0, DB-002).
- Zero automated tests of any kind (unit, integration, e2e, security) exist anywhere in the repo.
- Offline/PWA capability (SRS §13, in MVP scope per §20.2) does not exist.
- File attachment capability (SRS §15.1) does not exist.
- Background job infrastructure (BullMQ) is scaffolded but not wired to a single real job.
- Build/lint/production-readiness status: **see §14/§17 below (worker audit in progress at time of writing; this document will be updated in place once it lands).**

---

## 3. SRS Traceability Matrix

Statuses: **IMPLEMENTED** / **PARTIALLY_IMPLEMENTED** / **MISSING** / **INCORRECT** / **UNVERIFIED** / **OUT_OF_SCOPE**. Matrix is at SRS-section/capability granularity (not literally every "shall" sentence), per the audit brief's instruction not to mark something IMPLEMENTED merely because a CRUD screen exists — every row below reflects whether the underlying business rule, not just the data shape, is enforced.

| SRS § | Requirement | Module | Backend | API | DB | Frontend | Tests | Status |
|---|---|---|---|---|---|---|---|---|
| 3.2/3.3 | Multi-tenant isolation, backend never trusts client tenantId | Platform | Solid extension design | 139/139 endpoints route through it | No DB-level backstop (RLS) — DB-010 | N/A | None | **PARTIALLY_IMPLEMENTED** (1 confirmed leak, TEN-001) |
| 4.1 | 16-role catalog | Platform | All 16 present | — | — | Roles matrix UI | None | **IMPLEMENTED** |
| 4.2 | 8-action permission model | Platform | View/Create/Update/Delete/Approve/Reject enforced; Export/Print modeled only | RBAC-002 | — | Only 3 of 8 actions have UI (FE-003) | None | **PARTIALLY_IMPLEMENTED** |
| 4.1/16.1 | Per-factory access control | Platform | Computed, never checked (RBAC-001) | — | `UserFactoryAccess` model exists | No factory filter on most lists (FE-007) | None | **INCORRECT** |
| 5.1 | Authentication & session mgmt | Auth | Login/logout/reset/history all real | 7 endpoints | `RefreshToken`/`LoginHistory` | Auth pages solid | None | **IMPLEMENTED** (hardening gaps: AUTH-001/002/003) |
| 5.2 | Company management | Platform | Implemented | Implemented | `Tenant` fields | Settings page | None | **IMPLEMENTED** |
| 5.3 | Factory management (multi-factory) | Platform | Implemented | Implemented | `Factory`+13 dependents, Restrict-protected | Implemented, no cross-factory filter (FE-007) | None | **PARTIALLY_IMPLEMENTED** |
| 5.4 | Master data (Product/Material/Customer/Supplier) | Master Data | Implemented | Implemented | Implemented, correctly tenant-unique | Implemented (5 pages missing PermissionGate, FE-005) | None | **IMPLEMENTED** |
| 6.1 | Sales Order lifecycle | Sales | Create/list solid; status is a free-form enum (WF-001/002/003) | Implemented | Implemented | Status dropdown offers all transitions (FE-013) | None | **PARTIALLY_IMPLEMENTED** |
| 6.2 | Procurement approval workflow | Procurement | Approval gate bypassable (WF-004/005); QC step skipped (WF-006) | Non-atomic Goods Receipt (API-001) | Implemented | Implemented | None | **INCORRECT** (approval + QC ordering both violated) |
| 7.1–7.4 | Production planning/batches/traceability | Production | Status free-form (WF-007); output can skip inventory (INV-004) | Non-atomic output/consumption (API-003/004) | Implemented; `ProductionBatch` has no soft-delete (DB-001) | Implemented | None | **PARTIALLY_IMPLEMENTED** |
| 7.5/7.6 | Machine/loom management & tracking | Machines | Implemented | Implemented | Implemented | Implemented, no factory column (FE-007) | None | **IMPLEMENTED** |
| 7.7 | Downtime management | Downtime | Implemented, auto-corrective-job works (verified) | Implemented | Implemented | Implemented | None | **IMPLEMENTED** (machine-status desync: WF-017) |
| 8.1 | Inventory operations (7 ops) | Inventory | All 7 exist and route through `InventoryService` | Implemented | Implemented; unique constraint gap (DB-002) | Implemented | None | **PARTIALLY_IMPLEMENTED** |
| 8.2 | Warehouse→Location→Rack→Bin | Inventory | Rack/Bin are text fields, not first-class levels (INV-008) | Implemented | Implemented | Factory+Warehouse filter only | None | **PARTIALLY_IMPLEMENTED** |
| 8.3 | Unbroken audit trail, stock never silently changed | Inventory | Manual movements not audit-logged (API-006); non-atomic ops (API-001–004) | — | Polymorphic refs have no FK (DB-005) | — | None | **PARTIALLY_IMPLEMENTED** |
| 8.4 | Dispatch (incl. partial) | Dispatch | No Ready/QC precondition (WF-012/013); over-delivery possible (WF-014); PLANNED/PACKED/DELIVERED unreachable | Non-atomic (API-002) | Implemented | Implemented | None | **INCORRECT** |
| 9.1 | Quality outcomes (Pass/Rework/Hold/Reject) | Quality | Outcomes recorded but block nothing downstream (WF-015, P0) | Implemented | Implemented | Implemented | None | **INCORRECT** |
| 9.2 | Quality traceability chain | Quality | Links exist (`productionBatchId` etc.) but nothing reads them to gate anything | — | `goodsReceiptId` has no back-relation (WF-015 detail) | — | None | **PARTIALLY_IMPLEMENTED** |
| 9.3 | Maintenance (corrective + preventive) | Maintenance | Corrective auto-creation **verified fully working**; Preventive "due" is a passive query, no scheduled reminder, `nextDueAt` never advances (WF-018) | Implemented | No `MaintenanceJob↔MaintenanceSchedule` link | Implemented | None | **PARTIALLY_IMPLEMENTED** |
| 10.1 | HR / Employee profiles | HR | Implemented | Implemented | Implemented | Implemented | None | **IMPLEMENTED** |
| 10.2 | Attendance | HR | Implemented | Implemented | Implemented | Implemented, no zod validation (FE-002) | None | **IMPLEMENTED** |
| 10.3 | Payroll (inputs, not full engine — matches SRS's own MVP scope note) | Payroll | Implemented per SRS's reduced MVP bar; entries not audit-logged (API-015) | Implemented | Implemented | Implemented | None | **PARTIALLY_IMPLEMENTED** |
| 11 | Costing formula | Costing | `CostSheet` exists and is populated; exact formula fidelity to SRS §11 not independently re-derived by any audit stream | Implemented | Implemented | Implemented | None | **UNVERIFIED** |
| 12 | Role-specific dashboards | Dashboards | Real Prisma aggregations, not mocked (verified) | Implemented | — | Implemented | None | **PARTIALLY_IMPLEMENTED** (TEN-001 leak on Quality Dashboard) |
| 12.7 | Notifications | Notifications | Storage/read/mark-read implemented; **zero producers wired** — `notify()` has no caller anywhere for any of the 8 SRS-listed trigger events | Implemented | Implemented | Frontend fully unreachable — no nav entry (FE-006) | None | **PARTIALLY_IMPLEMENTED** (infra only) |
| 13 | Offline/PWA (in MVP scope per §20.2) | Offline | No service worker, no IndexedDB, no sync engine, no local queue anywhere in the repo | — | `SyncEvent` model exists, unused | — | None | **MISSING** |
| 14 | Abyte AI | AI | — | — | — | — | — | **OUT_OF_SCOPE** (SRS itself scopes this to Phase 2, §14) |
| 15.1 | File attachments | Files | No upload endpoint, no multer/S3 client wired anywhere; MinIO container + env vars exist, unconsumed | — | `FileAsset` model exists, unused | — | None | **MISSING** |
| 15.2 | Audit logging | Platform | Good coverage on primary create/status actions; gaps on `updateBatchStatus`, manual inventory movements, payroll entries, maintenance schedule/auto-job creation | — | `AuditLog` well-indexed | — | None | **PARTIALLY_IMPLEMENTED** |
| 16.1 | Security controls | Platform | See §15 Security Audit | — | — | — | None | **PARTIALLY_IMPLEMENTED** |
| 16.2/16.3 | Performance/scalability | Platform | No background jobs wired yet; missing status/factoryId indexes (DB-013) | — | — | — | None | **PARTIALLY_IMPLEMENTED** |
| 17.1/17.2 | DB architecture/design rules | Platform | See §7 Database Audit | — | 18 findings | — | None | **PARTIALLY_IMPLEMENTED** |
| 17.3/17.4 | Backend/frontend tech stack | Platform | Matches SRS §23 exactly | — | — | Matches | None | **IMPLEMENTED** |
| 17.5–17.6 | Infra, deployment, backups | Platform | **Pending §14/§17 — worker/production-readiness stream in progress** | — | — | — | — | **UNVERIFIED (pending)** |
| 17.7 | REST/v1, validated DTOs, consistent envelope | Platform | Confirmed compliant | 139/139 | — | — | None | **IMPLEMENTED** (idempotency gap: API-005) |
| 18 | Testing requirements (unit/integration/e2e/security/offline) | Platform | Zero automated tests of any kind exist | — | — | — | **0%** | **MISSING** |
| 20.2 | MVP scope group | Platform | See §22 walkthrough below | — | — | — | — | **PARTIALLY_IMPLEMENTED** |
| 22 | MVP Acceptance Criteria (25 items) | Platform | **10 fully met / 9 partial / 6 missing or failing** — full walkthrough in §26 | — | — | — | — | **PARTIALLY_IMPLEMENTED** |


---

## 4. Module-by-Module Audit

Brief per-module verdict; full detail is in the numbered sections below (§6–§15) and the consolidated severity lists (§18–§21). "Backend/API" and "Frontend" columns are separate because several modules have solid CRUD on both sides but a broken business rule sitting on top of both.

| Module | Backend/API maturity | Frontend maturity | Headline gap(s) |
|---|---|---|---|
| Auth / Session | Solid | Solid | AUTH-001 (no refresh-family revocation), AUTH-002/003 (minor hardening) |
| Multi-Tenancy (platform) | Solid architecture, one live leak | N/A | **TEN-001 (P0, cross-tenant leak)** |
| RBAC / Permissions | Model complete, one enforcement gap | Mirrors backend gap | **RBAC-001 (P0, factory access unenforced)**, RBAC-002 (Export/Print not enforced) |
| Company / Factory / Warehouse | Solid | Solid | Minor (FE-007 no factory filter) |
| Products / Materials / Customers / Suppliers | Solid | Solid, oldest pages missing PermissionGate | FE-005 |
| Sales | CRUD solid, lifecycle unenforced | Solid | **WF-001/002/003**, FE-013 |
| Procurement | CRUD solid, approval gate bypassable, QC step skipped | Solid | **WF-004/005/006**, **API-001 (P0, non-atomic receipt)** |
| Production | CRUD solid, status free-form, output can skip inventory | Solid | **WF-007/008**, INV-004, API-003/004 |
| Inventory (ledger) | Architecturally sound single-source-of-truth; atomicity/race gaps | Solid | **DB-002 (P0, race)**, INV-001/002, API-006 (no audit) |
| Dispatch | Created without preconditions, no QC awareness, can over-deliver | Solid (create-only UI) | **WF-012/013**, **API-002 (P0, non-atomic)** |
| Quality | Inspections recorded; outcomes don't block anything | Solid | **WF-015 (P0)** |
| Maintenance | Corrective auto-creation verified working; preventive reminders inert | Solid | WF-017/018 |
| HR / Employees / Shifts / Attendance | Solid | Solid; **Shifts module unreachable in nav (FE-006)** | — |
| Payroll | Inputs-only per SRS's own reduced MVP bar; entries unaudited | Solid | API-015 |
| Costing | Exists, formula not independently re-derived | Solid | UNVERIFIED |
| Dashboards | Real aggregations, one leaks cross-tenant | Solid | **TEN-001 (P0)** |
| Notifications | Storage/read works; **zero triggers wired to any of 8 SRS events** | Fully unreachable in nav (FE-006) | WRK-004 |
| Files / Attachments | **Not built** | N/A | MISSING (SRS §15.1) |
| Offline / PWA | **Not built** | N/A | MISSING (SRS §13, in MVP scope) |
| Worker / Background Jobs | Scaffolded directory only, zero code | N/A | WRK-001 |
| Abyte AI | Not built | N/A | OUT_OF_SCOPE (SRS itself defers to Phase 2) |

---

## 5. Backend Audit

The NestJS backend (`apps/api`) is architecturally consistent and follows the same pattern in every module: a `*.module.ts`/`*.controller.ts`/`*.service.ts`/`dto/*.ts` quartet, tenant-scoped via `PrismaService.db`, permission-gated via `@RequirePermission`, DTO-validated via `class-validator`, audit-logged via `AuditService.log()` (mostly). This consistency is a genuine strength — it makes every finding in this audit mechanically similar to fix across modules, because the pattern that needs hardening (transaction wrapping, state-transition guards) is the same pattern repeated, not 20 different ad-hoc designs.

**Confirmed compliant with SRS §17.7 API standards:** REST under `/api/v1` (verified in `main.ts`), global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`, consistent `{ data, meta? }` response envelope, a global exception filter that never leaks stack traces or raw Prisma error text to the client (verified — this exceeds the SRS's bar), Swagger/OpenAPI wired and correctly gated to non-production.

**The two systemic backend defects, cutting across nearly every write-heavy module:**

1. **No transaction wrapping across multi-step business+inventory writes** (API-001–004, INV-001/005) — Goods Receipt, Dispatch, Production batch-output, and Production material-consumption each perform their business-record write and their `InventoryService.recordMovement()` call as separate, independently-committing operations. `InventoryService.recordMovement()` itself always opens its own transaction with no way for a caller to join an outer one — this is the concrete architectural blocker to fixing all four call sites, and should be fixed once (make `recordMovement`/`transferStock` accept an optional `tx` client) rather than four times.
2. **No state-transition enforcement on any of the seven business-object lifecycles** (WF-001 through WF-019, full detail in §11) — every `status` field accepts any enum value from any current state via a plain `@IsIn(ENUM_VALUES)` DTO validator with no adjacency check against the record's existing status.

Full endpoint-level detail (139 endpoints, 28 controllers) is in §12; full workflow-by-workflow detail is in §11; full inventory-ledger detail is in §10; full multi-tenancy/RBAC/auth detail is in §8/§9/§13.

---

## 6. Frontend Audit

*(Full findings from the dedicated Frontend Audit stream; module-by-module scope covers all 24 `apps/web/src/features/*` modules.)*

## AbyteTex Frontend Audit (apps/web)

Scope: module-by-module review of `apps/web/src/features/*` (24 modules), their route pages under
`apps/web/src/app/(dashboard)/*`, the shared primitives in `apps/web/src/components/shared/`, the
API client (`apps/web/src/lib/api-client.ts`), and the auth bootstrap flow
(`apps/web/src/hooks/use-auth-bootstrap.ts`). Read-only static analysis — no dev server, no browser
was used. Every claim below is either a direct code read (cited with file/line) or a repo-wide grep
whose scope is stated. Per the assignment brief, anything that "looks correct in code" but wasn't
exercised in a rendered browser is marked **UNVERIFIED-IN-BROWSER**; anything demonstrably wrong by
reading the code alone is stated as a fact.

### How the shared primitives behave (baseline every module either inherits or deviates from)

- `components/shared/data-table.tsx` — `DataTable` has a real built-in loading state (5 skeleton
  rows) and a real empty state (icon + configurable message). It has **no error state at all** — it
  only takes `isLoading` and `data`; there is no `isError`/`error` prop. Any module that doesn't
  separately handle a failed fetch will render the *empty* state for a *failed* request.
- `components/shared/pagination-bar.tsx` — `PaginationBar` is a thin, correct renderer of server-side
  `PaginatedMeta` (`page`/`pageSize`/`total`/`totalPages`); it does no client-side slicing itself, so
  any module that passes it a real API `meta` object is doing real server-side pagination, not a
  full-fetch-then-slice.
- `components/shared/confirm-dialog.tsx` — `ConfirmDialog` is a complete, generic, ready-to-use
  confirmation modal (destructive styling, loading-disabled buttons). Confirmed by repo-wide grep: it
  is **never imported or rendered anywhere except its own definition file**. No feature module uses
  it (see FE-003).
- `components/shared/permission-gate.tsx` — `PermissionGate` mirrors the API's `PermissionsGuard`
  exactly, including giving platform admins no bypass on tenant permissions. Correct in isolation;
  see FE-005 for inconsistent adoption across pages.
- `components/shared/status-badge.tsx` — always renders the status text (`status.replaceAll("_", " ")`)
  alongside the color, so color is never the *only* signal (good baseline a11y). See FE-010 for a
  narrower coverage issue.
- `lib/api-client.ts` — `apiFetch` is a **single, consistent error path** for every module: non-2xx
  responses throw `ApiError(message, statusCode, error)`, and `message` is already
  array-joined from class-validator's `message: string[]`. Every mutation hook in every module (100
  `toast.error`/`toast.success` call sites across 23 files, grepped) catches this the same way:
  `toast.error(err instanceof ApiError ? err.message : "fallback")`. This is a genuine strength — see
  FE-001 for the one place this consistency doesn't extend (queries, not mutations).
- `hooks/use-auth-bootstrap.ts` + `app/(dashboard)/layout.tsx` + `app/(auth)/layout.tsx` — confirmed
  correct: `useAuthStore.status` starts `"idle"`, becomes `"loading"` for the duration of
  `POST /auth/refresh` + `GET /auth/session`, and only becomes `"authenticated"`/`"unauthenticated"`
  once both resolve. Both layouts render a centered spinner while `status` is `"idle"|"loading"` and
  only redirect (`router.replace`) once status has actually resolved. **There is no flash of
  unauthenticated content and no incorrect redirect-then-flash-back on reload.** This is correct as
  read; browser confirmation would still be worthwhile but nothing in the code suggests a problem.
- Cache invalidation: grepped `invalidateQueries` across `features/**/hooks.ts` — 62 call sites across
  all 24 modules' hook files, every create/update/delete-style mutation's `onSuccess` invalidates the
  relevant list query key. No module was found skipping this.
- Optimistic updates: grepped `setQueriesData|onMutate|optimistic` across `features/**` — zero matches.
  Nothing in the app does an optimistic update, so there is no optimistic-update rollback risk to
  evaluate; every mutation is invalidate-after-confirm.

### Summary table

Grading is Y / N / PARTIAL / N-A (not applicable to that module's shape). "Confirm-dialog" is graded
against whether the module has any one-click destructive/irreversible action (status change, close,
etc.) that fires without confirmation — marked **N\*** where such an action concretely exists today
(higher real risk) vs. **N-A** where the module has no one-click destructive action to begin with
(only full-form edits).

| Module | Loading | Empty | Error | Validation | Permission-aware | Confirm-dialog | Pagination | Cache-invalidation |
|---|---|---|---|---|---|---|---|---|
| products | Y | Y | N | PARTIAL | PARTIAL (no page gate) | N-A | Y | Y |
| customers | Y | Y | N | PARTIAL | PARTIAL (no page gate) | N-A | Y | Y |
| suppliers | Y | Y | N | PARTIAL | PARTIAL (no page gate) | N-A | Y | Y |
| materials | Y | Y | N | PARTIAL | PARTIAL (no page gate) | N-A | Y | Y |
| factories | Y | Y | N | PARTIAL | PARTIAL (no page gate) | N-A | Y | Y |
| users | Y | Y | N | PARTIAL | Y | N-A (status via full edit form only) | Y | Y |
| roles | Y | Y | N | N-A (matrix, not fields) | Y | N-A (save is explicit, reviewed) | N-A (small fixed list) | Y |
| tenants | Y | Y | N | PARTIAL | Y (platformOnly gate) | **N\*** (status dropdown incl. SUSPENDED/CANCELLED) | Y | Y |
| machines | Y | Y | N | PARTIAL | Y | N-A (status via edit form) | Y | Y |
| employees | Y | Y | N | PARTIAL | Y | N-A (status via edit form) | Y | Y |
| attendance | Y | Y | N | PARTIAL (manual state, no schema) | Y | N-A | Y | Y |
| shifts | Y | Y | N | PARTIAL | Y | N-A | N (not wired to PaginationBar) | Y |
| inventory | Y | Y | N | PARTIAL (manual state) | Y | N-A (movements are additive, not destructive) | Y (both tabs) | Y |
| sales | Y | Y | N | PARTIAL | Y | **N\*** (status dropdown incl. CANCELLED) | Y | Y |
| procurement | Y | Y | N | PARTIAL | Y | **N\*** (status dropdown incl. CANCELLED) | Y | Y |
| production | Y | Y | N | PARTIAL | Y | **N\*** (status dropdown, no restriction) | Y | Y |
| dispatch | Y | Y | N | PARTIAL (manual state) | Y | N-A (create-only, no status action shown) | Y | Y |
| quality | Y | Y | N | PARTIAL (manual state) | Y | N-A (create-only) | Y | Y |
| maintenance | Y | Y | N | PARTIAL (manual state) | Y | **N\*** (status dropdown, one click) | Y | Y |
| downtime | Y | Y | N | PARTIAL (manual state) | Y | **N\*** ("Close" fires on single click) | Y | Y |
| costing | Y | Y | N | PARTIAL (manual state) | Y | N-A (create-only) | Y | Y |
| payroll | Y | Y | N | PARTIAL (manual state) | Y | **N\*** (status dropdown incl. approve/lock) | Y | Y |
| settings | Y | N-A (single record) | N | PARTIAL | Y | N-A | N-A | Y |
| notifications | N (no loading indicator in bell) | Y | N | N-A | N-A | N-A (mark-read is non-destructive) | N-A | Y |
| dashboards | Y (StatCard skeleton) | Y (explicit "no X yet" text per tab) | N | N-A | Y (tab-level via canViewReports) | N-A | N-A | N-A (read-only) |

Worst-scoring group: **products, customers, suppliers, materials, factories** — the five earliest-built
master-data modules are the only ones missing the page-level `PermissionGate` wrapper that every later
module has (FE-005), and every module in the table fails "Error" and has only partial validation, so
those five don't stand out on those two axes specifically — they stand out on permission-awareness and
because they're the modules a first-time factory admin touches most.

### Detailed findings

#### [FE-001] No module surfaces a failed API request as an error — it silently renders as an empty list
- Severity: P0
- Module: all 24 (systemic; verified by repo-wide grep)
- File/path: `apps/web/src/components/shared/data-table.tsx` (no `error`/`isError` prop exists on
  `DataTableProps`); confirmed zero usages of `isError` anywhere under `apps/web/src/app/**` or
  `apps/web/src/features/**` except `app/(auth)/login/page.tsx` (grep: `isError` → 1 file total).
- Current behavior: every list page does `const { data, isLoading } = useXxx(...)` and passes
  `data?.data ?? []` and `isLoading` straight into `DataTable`. `useQuery`'s `error` field is never
  read. If the request fails for *any* reason — network error, a 500, or a 403 from `PermissionGate`
  not catching a role that lost access mid-session — `isLoading` becomes `false`, `data` stays
  `undefined`, `data?.data ?? []` evaluates to `[]`, and `DataTable` renders its empty state
  ("No products yet. Add your first product to get started.", etc.) — visually identical to a
  genuinely empty, working list.
- Expected behavior: a failed query should render a distinct error state (e.g. "Couldn't load
  products — try again", with a retry button), not the "no records" empty state, per the audit
  brief's explicit requirement that a network error/500/403 be visibly distinguishable from an empty
  list.
- Why it matters: a user with a real permission problem, or hitting a real backend outage, sees the
  exact same "you have zero records" message a brand-new tenant sees. This is actively misleading in
  a multi-tenant ERP — a factory worker or supervisor would have no way to tell "nothing has been
  entered yet" from "the system is broken right now," and would likely re-submit forms or assume data
  loss.
- SRS reference: §17.4 ("fast, clean, professional... easy for factory workers to use") — a silent
  failure is the opposite of this; §22 acceptance-criteria style expectations around visible,
  trustworthy system behavior.
- Recommended fix: extend `DataTableProps` with an optional `error`/`isError` (and `onRetry`), render
  a distinct error row/state when set, and thread `isError`/`error` through from every list page's
  `useQuery` call (all ~22 call sites). Since the pattern is 100% uniform, this is a single shared-component
  change plus a mechanical per-page wiring pass.
- Test required: mock `apiFetch` to reject (e.g. force a 500) for one list page's query and confirm an
  error state renders, not "No records found."

#### [FE-002] No form uses schema-based (zod) client-side validation; only native `required: true` checks or nothing at all
- Severity: P1
- Module: all form-bearing modules (attendance, costing, customers, dispatch, downtime, employees,
  factories, inventory, machines, maintenance, materials, payroll, procurement, production, products,
  quality, sales, settings, shifts, suppliers, tenants, users)
- File/path: representative examples — `apps/web/src/features/products/product-form.tsx:47`
  (`{...register("sku", { required: true })}`), `apps/web/src/features/customers/customer-form.tsx:43`,
  `apps/web/src/features/suppliers/supplier-form.tsx:44`, `apps/web/src/features/materials/material-form.tsx:45`.
  Repo-wide grep for `zodResolver|from "zod"|@hookform/resolvers` returns exactly 3 files, all under
  `app/(auth)/*` (login, forgot-password, reset-password) — zero feature-module forms use it, despite
  `@abytetex/validation` (zod schemas) existing in the monorepo per `DEVELOPMENT_LOG.md`'s Phase 1 entry.
- Current behavior: every feature form either uses `react-hook-form` with only `{ required: true }`
  (no min/max length, no numeric range, no format pattern beyond the browser's native
  `type="email"`/`type="number"` behavior) — or, for roughly half the modules (attendance, downtime,
  maintenance's job-create, quality, dispatch, inventory's movement/transfer, payroll, costing), plain
  `useState` per field with a hand-rolled `canSubmit` boolean that is just a truthiness check on
  required fields, with **zero** validation feedback of any kind (see also FE-008).
- Expected behavior: forms should validate against a zod schema mirroring the backend DTO's actual
  constraints (e.g. `@IsEmail()`, string length limits, `@Min(0)`/positive-number constraints,
  enum membership), giving the user inline, specific errors before submit — not just "this field is
  required" or nothing.
- Why it matters: the gap between "compiles/required-only" and "matches backend constraints" is
  exactly the class of bug this project has already hit twice (D-021 blank-email 400, and generally
  the standing project takeaway that only exercising the real request surfaces validation mismatches).
  Right now the *only* thing preventing a mismatched-constraint 400 from reaching the user is the
  server's own validation pipe plus the `stripEmptyStrings` fix in `api-client.ts` — there is no
  client-side safety net for anything beyond "field is non-empty."
- SRS reference: §17.4 (client-side validation implied by "fast... easy for factory workers to use" —
  round-tripping to the server for a validation error is neither fast nor easy); the DTO-level
  constraints in the backend modules described in `DEVELOPMENT_LOG.md`.
- Recommended fix: introduce zod schemas per form (reusing `@abytetex/validation` conventions already
  established for auth) and wire `zodResolver` into every `useForm` call; for the ~10 manual-`useState`
  forms, migrate them onto `react-hook-form` + zod as well so field-level errors render consistently
  app-wide.
- Test required: for one representative form (e.g. Product), submit with an out-of-range value (e.g.
  negative GSM) and confirm a client-side error appears without a network request firing; repeat for a
  malformed email in Customer/Supplier.

#### [FE-003] `ConfirmDialog` is a complete, working shared component that is never used anywhere
- Severity: P1
- Module: all modules with a one-click status/close action (tenants, sales, procurement, production,
  maintenance, downtime, payroll — see the summary table's **N\*** cells)
- File/path: `apps/web/src/components/shared/confirm-dialog.tsx` (definition, unused); example
  call sites that skip it — `apps/web/src/app/(dashboard)/sales/[id]/page.tsx:53`
  (`onClick={() => statusMutation.mutate(s)}` inside a `DropdownMenuItem`, no confirmation, `s` can be
  `"CANCELLED"`), `apps/web/src/app/(dashboard)/tenants/page.tsx:73` (`onClick={() =>
  statusMutation.mutate({ id: t.id, status: s })}`, `s` can be `"SUSPENDED"`/`"CANCELLED"`),
  `apps/web/src/app/(dashboard)/downtime/page.tsx:48` (Close button fires
  `closeMutation.mutate(...)` directly on click), `apps/web/src/app/(dashboard)/maintenance/page.tsx:56`
  (status dropdown, same pattern), `apps/web/src/app/(dashboard)/purchase-orders/[id]/page.tsx:58` and
  `apps/web/src/app/(dashboard)/production-orders/[id]/page.tsx:67` (same pattern),
  `apps/web/src/app/(dashboard)/payroll/[id]/page.tsx:58` (same pattern).
- Current behavior: every one of these is a single click on a dropdown menu item (or a single button
  click for Downtime's "Close") that immediately calls `.mutate(...)` with no intermediate
  confirmation step. A `DropdownMenuItem` is a small hit target in a menu that opens on hover/click
  near several other items — a misclick lands directly on a real, immediate, irreversible-in-the-UI
  state transition (e.g. cancelling a live Sales Order, suspending a paying tenant, closing a downtime
  event with the current timestamp).
- Expected behavior: per the audit brief's explicit ask ("does every Delete action go through
  `ConfirmDialog`... or can a misclick immediately delete/mutate a record?") — any status change with
  real business consequence (especially CANCELLED/SUSPENDED/terminal states, or anything that stamps a
  timestamp like Downtime's Close) should route through `ConfirmDialog` before firing.
- Why it matters: there are no DELETE endpoints in this backend at all (confirmed: `grep -r "@Delete"`
  across `apps/api/src/**/*.controller.ts` returns zero matches, consistent with the status-based
  soft-lifecycle model), so these status-dropdown actions **are** the destructive-action surface of
  this application — the audit brief's "delete" framing maps directly onto them. None are guarded.
- SRS reference: §17.4 ("easy for factory workers to use... touch-friendly") — a touch/mouse misclick
  on a small dropdown item is exactly the scenario a confirmation step exists to catch; general UX
  expectation for irreversible business-state transitions in an ERP.
- Recommended fix: wrap `statusMutation.mutate(s)` (and Downtime's `closeMutation.mutate(...)`) calls
  in a local `ConfirmDialog` for status values considered terminal/high-impact (at minimum:
  CANCELLED, SUSPENDED, LOCKED/BLOCKED, TERMINATED, and Downtime Close) — the component already exists
  and takes `destructive` styling as a prop.
- Test required: click a status-change menu item for a terminal status and confirm a dialog intercepts
  before the mutation fires; confirm Cancel in that dialog does not mutate.

#### [FE-004] Reference-data picker dropdowns are capped at the first 20 records with no search, across virtually every create form in the app
- Severity: P1
- Module: systemic — every form that lets a user pick a Product/Material/Customer/Supplier/Factory/
  Employee/Machine/Warehouse/Sales-Order/Production-Order (products, customers, suppliers, materials,
  users, machines, employees, attendance, inventory, sales, procurement, production, dispatch,
  quality, maintenance, payroll, costing)
- File/path: the pattern is `useFactories(1, "")`, `useMaterials(1, "")`, `useProducts(1, "")`,
  `useCustomers(1, "")`, `useEmployees(1, "")`, `useSalesOrders(1, "")` etc. — literally hardcoded
  page `1`, empty search string, no way for the dropdown to see page 2+. Confirmed the API call behind
  every one of these caps at a fixed page size: `apps/web/src/features/products/api.ts:6`
  (`qs = new URLSearchParams({ page: String(params.page), pageSize: "20" })`) — every `features/*/api.ts`
  list function follows the same `pageSize: "20"` pattern. Example call sites:
  `apps/web/src/features/sales/sales-order-form.tsx:16-17` (product/customer pickers),
  `apps/web/src/app/(dashboard)/machines/page.tsx:39` (factory picker),
  `apps/web/src/app/(dashboard)/dispatches/page.tsx:75-77` (factory/warehouse/sales-order pickers),
  `apps/web/src/app/(dashboard)/production-orders/page.tsx:38-39`, and about a dozen more.
- Current behavior: any `<Select>` used to *pick* a related record while creating something else only
  ever offers the first 20 rows of that resource (by default/creation order — no explicit sort seen),
  with no search box inside the dropdown and no "load more." This is a completely different, and much
  more serious, version of the scaling problem than the list-page pagination (which is correctly wired
  to `PaginationBar` and real server pagination, per the summary table).
- Expected behavior: once a tenant has more than 20 products, materials, customers, employees, etc.
  (trivial for a real textile manufacturer, per the SRS's own framing of the target user), a Sales
  Order, Production Order, Dispatch, Quality Inspection, Payroll Entry, etc. **cannot be created
  against the 21st+ record at all** through the UI — the record simply never appears in the picker.
- Why it matters: this isn't a cosmetic gap, it's a functional ceiling on the app's usability at any
  real scale — exactly the "scaling problem once a tenant has thousands of records" the audit brief
  called out, except it hits *forms*, not just lists, and hits it at 21 records rather than
  "thousands."
- SRS reference: §17.4 ("fast... easy for factory workers to use"); the SRS's product/material/customer
  master-data sections (§5.4.x) which describe them as ordinary growing catalogs, not small fixed sets.
- Recommended fix: convert these pickers to a searchable/paginated combobox (e.g. `Command`+`Popover`,
  already in the component library per `components/ui/command.tsx`) that queries the existing
  `search` param server-side as the user types, the same way the list-page search boxes already do.
- Test required: seed 25+ products in a tenant and confirm the 25th is selectable from the Sales Order
  item picker.

#### [FE-005] Five master-data pages skip the page-level `PermissionGate` every other module has
- Severity: P2
- Module: products, customers, suppliers, materials, factories
- File/path: `apps/web/src/app/(dashboard)/products/page.tsx`,
  `apps/web/src/app/(dashboard)/customers/page.tsx`,
  `apps/web/src/app/(dashboard)/suppliers/page.tsx`,
  `apps/web/src/app/(dashboard)/materials/page.tsx`,
  `apps/web/src/app/(dashboard)/factories/page.tsx` — none import `PermissionGate`. Contrast with the
  17 other list pages (grep confirms `PermissionGate` used in `payroll`, `costing`, `downtime`,
  `employees`, `attendance`, `inventory`, `production-orders`, `machines`, `quality`, `maintenance`,
  `dispatches`, `purchase-orders`, `sales`, `settings/company`, `roles`, `users`, `tenants`), which all
  wrap their page component in `<PermissionGate resource={...} action={Action.VIEW}>`.
- Current behavior: these 5 pages only conditionally hide the *Create* button
  (`can(Resource.PRODUCT, Action.CREATE) ? <Button>...` etc.) — they never check `Action.VIEW` at the
  page level. A user who lacks even VIEW on Products (e.g. a narrowly-scoped role) who navigates
  directly to `/products` will not see the "You don't have access to this page" message
  `PermissionGate` renders elsewhere; instead the page attempts `useProducts(...)`, the API 403s, and
  — per FE-001 — that renders as the ordinary empty-list state.
- Expected behavior: consistent with every later-built module, these 5 pages should wrap their content
  in `PermissionGate` for `Action.VIEW`.
- Why it matters: this is a straightforward regression-of-consistency (these were the first 5 modules
  built, before the `PermissionGate` pattern was established, per `DEVELOPMENT_LOG.md`'s Phase 2 entry)
  that was never backfilled when the pattern was adopted everywhere else. Combined with FE-001, a
  permission-restricted user sees a confusing false-empty state instead of a clear access-denied
  message specifically on these 5 pages.
- SRS reference: §4.1–§4.2 (RBAC), §17.4 (clarity for the end user).
- Recommended fix: wrap each of the 5 pages' default export the same way `MachinesPage`/`EmployeesPage`
  do — a thin outer component rendering `<PermissionGate resource={Resource.X} action={Action.VIEW}>`
  around the existing page content component.
- Test required: as a role with no `product:view`, navigate directly to `/products` and confirm an
  access-denied message renders instead of an empty product table.

#### [FE-006] Search/filter is inconsistently available — present on master-data lists, absent on most transactional lists
- Severity: P2
- Module: sales, procurement (purchase-orders), production (production-orders), dispatch, quality,
  maintenance, downtime, payroll, costing, attendance — all missing any search/filter input, vs.
  products/customers/suppliers/materials/factories/users/tenants which all have a debounced search box
  wired to the API's `search` param.
- File/path: compare `apps/web/src/app/(dashboard)/products/page.tsx:74-87` (search `Input` +
  `useDebouncedValue` + `setPage(1)` on change) and `apps/web/src/app/(dashboard)/sales/page.tsx:55-60`
  (Sales *does* have the same search-box pattern) against
  `apps/web/src/app/(dashboard)/production-orders/page.tsx`,
  `apps/web/src/app/(dashboard)/purchase-orders/page.tsx`,
  `apps/web/src/app/(dashboard)/dispatches/page.tsx`,
  `apps/web/src/app/(dashboard)/quality/page.tsx`,
  `apps/web/src/app/(dashboard)/maintenance/page.tsx`,
  `apps/web/src/app/(dashboard)/downtime/page.tsx`,
  `apps/web/src/app/(dashboard)/payroll/page.tsx`,
  `apps/web/src/app/(dashboard)/costing/page.tsx`, and
  `apps/web/src/app/(dashboard)/attendance/page.tsx` have no search/filter UI at all — only pagination
  through pages of whatever the default sort order is.
- Current behavior: on these 10 pages, finding a specific Purchase Order, Production Order, Maintenance
  Job, etc. requires paging through the full list in whatever order the API returns it (append order,
  most likely) with no way to filter by status, date range, machine, customer, or free text.
- Expected behavior: at minimum, status and date-range filtering (these are exactly the fields a
  factory floor supervisor would filter by — "show me open maintenance jobs," "show me this week's
  dispatches") should reset to page 1 on change, matching the existing `search` pages' pattern.
- Why it matters: these are the highest-transaction-volume modules in the app (orders, dispatches,
  inspections, downtime events) — exactly where filterless pagination degrades fastest as a tenant
  accumulates real operational history.
- SRS reference: §17.4 ("fast... easy for factory workers to use").
- Recommended fix: extend each of these 10 modules' `list` API functions and hooks to accept the same
  `search`/status-filter query params the backend likely already supports for consistent list
  endpoints (would need backend confirmation per-endpoint, out of this audit's scope), and add the
  same debounced-search-input + reset-to-page-1 pattern already proven on the master-data pages.
- Test required: on Maintenance or Downtime with 25+ records spanning multiple statuses, confirm there
  is no way to narrow the list to a single status without manually paging.

#### [FE-007] No factory filter on the list view for most factory-scoped modules (only Inventory has one)
- Severity: P2
- Module: machines, employees, attendance, maintenance, downtime, quality (all factory-scoped
  resources per their Prisma models), vs. `inventory` which has a working Factory→Warehouse filter pair.
- File/path: `apps/web/src/app/(dashboard)/inventory/page.tsx:76-91` (Factory + Warehouse `<Select>`
  filters feeding `useStockLevels`/`useStockMovements`) is the only list page with a factory-scoping
  filter. `apps/web/src/app/(dashboard)/machines/page.tsx`,
  `apps/web/src/app/(dashboard)/employees/page.tsx`,
  `apps/web/src/app/(dashboard)/attendance/page.tsx`,
  `apps/web/src/app/(dashboard)/maintenance/page.tsx`,
  `apps/web/src/app/(dashboard)/downtime/page.tsx`,
  `apps/web/src/app/(dashboard)/quality/page.tsx` all fetch an unfiltered list (their `list*` hooks
  take no `factoryId` param) — Factory only appears as a required field *inside the create form*.
- Current behavior: a user with access to multiple factories sees one combined Machines/Employees/
  Attendance/Maintenance/Downtime/Quality list with no way to narrow it down to a single factory; the
  Factory column isn't even shown in some of these tables (e.g. Machines' columns are Code/Name/Type/
  Location/Status — no Factory column at all), so a multi-factory tenant can't even tell which factory
  a given machine belongs to from the list.
- Expected behavior: consistent with Inventory, these lists should have a Factory selector (scoped to
  the factories the user has access to, mirroring `UserFactoryAccess`), and ideally show the Factory in
  a column when unfiltered.
- Why it matters: SRS explicitly calls out multi-factory as a core scenario (Factory→Department→
  Warehouse hierarchy, per-user factory access). For a Company Owner or Ops Manager overseeing several
  factories, these lists become unusable at scale without a way to scope to one factory at a time.
- SRS reference: §5.3 (Factory hierarchy), §17.4.
- Recommended fix: add a Factory `<Select>` filter (same pattern as Inventory's) to each of these 6
  list pages, threading `factoryId` into the corresponding `list*` API/hook functions, and add a
  Factory column to tables that don't currently show one.
- Test required: as a user with access to 2+ factories and machines in both, confirm the Machines list
  can be narrowed to one factory and that the other factory's machines are excluded.

#### [FE-008] "Manual state" forms (not built on react-hook-form) give zero validation feedback beyond a disabled submit button
- Severity: P2
- Module: attendance, downtime, maintenance (job-create), quality, dispatch, inventory
  (movement/transfer), payroll, costing — roughly 10 create forms across these modules
- File/path: e.g. `apps/web/src/app/(dashboard)/downtime/page.tsx:77-127` (`CreateDowntimeForm` — all
  `useState`, `canSubmit = machineId && category`, submit button is simply `disabled={!canSubmit}`
  with no inline message anywhere in the form explaining *why*); same pattern in
  `apps/web/src/app/(dashboard)/maintenance/page.tsx:95-146`,
  `apps/web/src/app/(dashboard)/quality/page.tsx:67-186`,
  `apps/web/src/app/(dashboard)/attendance/page.tsx:65-130`,
  `apps/web/src/app/(dashboard)/inventory/page.tsx:125-333`,
  `apps/web/src/app/(dashboard)/payroll/[id]/page.tsx:110-165`,
  `apps/web/src/app/(dashboard)/costing/page.tsx:64-140`.
- Current behavior: these forms never show a red "X is required" message the way the
  react-hook-form-based forms do (e.g. `product-form.tsx:48`'s `{errors.sku && <p
  className="text-xs text-destructive">SKU is required</p>}`). The only feedback a user gets is that
  the submit button stays disabled — with no indication of which of the several required fields (e.g.
  Downtime's Machine + Category, Dispatch's Factory + Warehouse + Sales Order + at least one item row)
  is still missing.
- Expected behavior: same inline field-level error affordance the react-hook-form modules already
  have, ideally unified via the zod migration recommended in FE-002.
  
- Why it matters: a "why won't this button click" experience is a real usability tax on exactly the
  users least likely to guess (factory-floor operators filling in Downtime/Attendance/Quality forms
  quickly between shifts) — this directly cuts against the SRS's "fast... easy for factory workers"
  bar.
- SRS reference: §17.4.
- Recommended fix: covered by the FE-002 zod migration; alternatively, as an interim fix, add explicit
  per-field "required" hint text under the disabled fields in these ~10 forms.
- Test required: open the Downtime create form and attempt to submit with only Machine filled in;
  confirm there's no visible explanation of what else is needed.

#### [FE-009] Numeric inputs accept negative and zero values client-side with no `min` constraint
- Severity: P2
- Module: sales (unit price/quantity), procurement/production (goods receipt/consumption/output
  quantities), inventory (movement/transfer quantity), customers/suppliers (credit limit), materials
  (reorder level), products (GSM/width), payroll (base salary/overtime/incentive/deductions)
- File/path: representative — `apps/web/src/features/sales/sales-order-form.tsx:85`
  (`<Input type="number" step="any" value={item.quantity} onChange={(e) => updateItem(index, {
  quantity: Number(e.target.value) })} />` — no `min={0}`, and `Number("")` / `Number("-5")` both pass
  through silently), `apps/web/src/app/(dashboard)/inventory/page.tsx:215`
  (`<Input type="number" step="any" value={quantity} ... />`, quantity feeds `RECEIVE`/`ISSUE`
  movements), `apps/web/src/features/customers/customer-form.tsx:81` (credit limit, no `min`).
- Current behavior: none of these `<Input type="number">` elements set a `min` attribute, and none of
  the corresponding validation logic (native-`required` or manual `canSubmit`) checks for
  non-negativity — only `quantity > 0` is checked in a few of the manual forms (e.g.
  `apps/web/src/app/(dashboard)/inventory/page.tsx:143` does check `quantity > 0` for Record
  Movement), but others (unit price, credit limit, reorder level, GSM, payroll amounts) accept
  negative numbers with no client-side signal at all.
- Expected behavior: quantities, prices, and similar business amounts should reject negative input at
  the UI layer (via `min={0}` plus zod's `.positive()`/`.nonnegative()` once FE-002 is addressed), not
  rely solely on whatever the backend DTO happens to enforce.
- Why it matters: entering a negative unit price or credit limit either produces a confusing backend
  400 (best case) or, if the backend DTO doesn't specifically guard that field, silently corrupts a
  monetary or stock figure — exactly the class of "stock shall never be changed silently" concern the
  project's own architecture notes (`InventoryService`) take seriously on the backend side, undermined
  here on the frontend input side.
- SRS reference: §8.3 (stock integrity intent), §17.4.
- Recommended fix: add `min={0}` (or an appropriate positive floor) to every business-quantity/amount
  input, and fold this into the FE-002 zod schemas.
- Test required: in the Sales Order form, type `-10` into a line item's Unit Price and confirm the
  create button either stays disabled or the submitted payload is rejected client-side before any
  request fires.

#### [FE-010] `StatusBadge`'s hardcoded color-classification set doesn't cover most of the status enums actually used in the app
- Severity: P3
- Module: machines (RUNNING/IDLE/OFFLINE), tenants (TRIAL), several order-type statuses (IN_PROGRESS,
  DISPATCHED, SHIPPED), employees (ON_LEAVE, TERMINATED), maintenance (CORRECTIVE/PREVENTIVE as
  `jobType`, not graded but adjacent), production batches (IN_PROGRESS)
- File/path: `apps/web/src/components/shared/status-badge.tsx:4-6` —
  `POSITIVE = {"ACTIVE","COMPLETED","APPROVED","PASS","PAID","DELIVERED","ACCEPTED"}`,
  `NEGATIVE = {"INACTIVE","BLOCKED","LOCKED","REJECTED","CANCELLED","BREAKDOWN","REJECT"}`,
  `NEUTRAL_WARN = {"INVITED","PENDING_APPROVAL","DRAFT","HOLD","MAINTENANCE","PENDING_QC"}` — anything
  not in one of these three sets (e.g. `RUNNING`, `IDLE`, `OFFLINE`, `TRIAL`, `IN_PROGRESS`,
  `DISPATCHED`, `SHIPPED`, `ON_LEAVE`, `TERMINATED`, `SUSPENDED`) falls through to the default
  `"bg-secondary text-secondary-foreground"` gray, with no color signal.
- Current behavior: e.g. a machine showing `RUNNING` (a healthy, "everything is fine" state) renders in
  the same neutral gray as one showing `IDLE` — there's no visual distinction between "machine is
  actively producing" and "machine is doing nothing," even though `BREAKDOWN` (also a machine status)
  *is* correctly colored red. Text is always shown (`status.replaceAll("_"," ")`), so this is a
  consistency/usefulness gap, not a strict accessibility failure (color is never the *only* signal —
  see the shared-primitives note above).
- Expected behavior: the classification sets should be extended to cover the actual status enums each
  domain module uses (Machine, Tenant, SalesOrder, PurchaseOrder, ProductionOrder, ProductionBatch,
  Employee, Dispatch, Downtime, MaintenanceJob, Payroll statuses), or `StatusBadge` should accept a
  per-domain color-mapping override so each module's meaningful states are actually distinguished at a
  glance.
- Why it matters: on a factory floor dashboard, being able to scan a Machines table and immediately see
  which machines are red (down) vs. green (running) vs. gray (idle) is exactly the kind of glanceable
  signal SRS §17.4's "fast... easy to use" is describing — right now RUNNING and IDLE look identical.
- SRS reference: §17.4, §7.5 (machine status tracking).
- Recommended fix: audit every status enum actually rendered via `<StatusBadge>` across the codebase
  and extend the three sets (or introduce a small per-Resource override map) to cover them.
- Test required: UNVERIFIED-IN-BROWSER — render the Machines list with a `RUNNING` and an `IDLE`
  machine and visually confirm both currently show the same gray badge.

#### [FE-011] Several icon-only buttons have no `aria-label`
- Severity: P3
- Module: layout chrome (topbar, dashboard shell), sales, quality
- File/path: `apps/web/src/components/layout/topbar.tsx:41` (`<Button variant="ghost" size="icon"
  className="md:hidden" onClick={onMenuClick}><Menu className="h-5 w-5" /></Button>` — mobile nav
  toggle, no `aria-label`), `apps/web/src/components/layout/topbar.tsx:84`
  (`<DropdownMenuTrigger ...><Bell className="h-5 w-5" />...</DropdownMenuTrigger>` — notifications
  bell, no `aria-label`), `apps/web/src/features/sales/sales-order-form.tsx:96`
  (`<Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)}><Trash2
  className="h-4 w-4 text-destructive" /></Button>` — remove line-item, no `aria-label`), same pattern
  in `apps/web/src/app/(dashboard)/quality/page.tsx:173` (remove defect row).
- Current behavior: these buttons have no visible text and no `aria-label`/`aria-labelledby`, so a
  screen-reader user hears only "button" with no indication of what it does (open menu / view
  notifications / remove this line item).
- Expected behavior: every icon-only interactive control should carry an `aria-label` describing its
  action (e.g. `aria-label="Open navigation menu"`, `aria-label="Notifications"`,
  `aria-label="Remove item"`).
- Why it matters: this is a straightforward, cheap-to-fix accessibility gap; it's the exact pattern
  the audit brief asked to spot-check for.
- SRS reference: §17.4 (general usability/professionalism bar; no explicit a11y clause was found
  elsewhere in the SRS text reviewed).
- Recommended fix: add `aria-label` to each of the icon-only `Button`/`DropdownMenuTrigger` instances
  identified above (and spot-check the rest of the app for the same pattern — these four were found by
  targeted reading, not an exhaustive scan).
- Test required: UNVERIFIED-IN-BROWSER — run an automated a11y scan (e.g. axe) against the dashboard
  shell and Sales Order create sheet and confirm these controls are flagged/fixed.

#### [FE-012] Manual-state forms don't associate `<Label>` with their `<Input>` via `htmlFor`/`id`
- Severity: P3
- Module: downtime, maintenance, quality, dispatch, payroll, costing, inventory (movement/transfer),
  attendance (~10 forms total — the same set identified in FE-008)
- File/path: e.g. `apps/web/src/app/(dashboard)/downtime/page.tsx:116-117`
  (`<div className="space-y-1.5"><Label>Reason</Label><Input value={reason}
  onChange={(e) => setReason(e.target.value)} /></div>` — `Label` has no `htmlFor`, `Input` has no
  `id`), same pattern repeated for every plain-text/number field in
  `apps/web/src/app/(dashboard)/quality/page.tsx`, `apps/web/src/app/(dashboard)/costing/page.tsx`,
  `apps/web/src/app/(dashboard)/payroll/[id]/page.tsx`,
  `apps/web/src/app/(dashboard)/inventory/page.tsx`. Contrast with the react-hook-form-based forms
  (e.g. `apps/web/src/features/products/product-form.tsx:46-47`,
  `<Label htmlFor="sku">SKU *</Label>` / `<Input id="sku" {...register("sku", ...)} />`), which
  correctly pair every label and input.
- Current behavior: clicking/tapping the label text in these manual-state forms does not focus the
  associated input (no native label-click-to-focus), and a screen reader announcing the input won't
  necessarily associate it with its label text, since there's no `for`/`id` relationship — it depends
  on DOM adjacency alone.
- Expected behavior: every `Label`/`Input` pair should have a matching `htmlFor`/`id`.
- Why it matters: label-click-to-focus is a small but real touch-target-friendliness win (SRS §17.4's
  "touch-friendly" — a bigger tappable target than the input alone matters on a factory-floor tablet),
  in addition to the standard screen-reader association benefit.
- SRS reference: §17.4.
- Recommended fix: add matching `id`/`htmlFor` pairs across the ~10 affected forms — mechanical,
  low-risk change; ideally done alongside the FE-002/FE-008 react-hook-form migration since RHF's
  `register()` pattern already encourages `id` usage.
- Test required: UNVERIFIED-IN-BROWSER — in the Downtime create form, click the "Reason" label text and
  confirm focus does not move to the Reason input (current expected-broken behavior); re-test after fix.

#### [FE-013] Status-change dropdowns offer every enum value with no restriction, compounding the missing-confirmation risk (FE-003)
- Severity: P2
- Module: sales, procurement, production, payroll, tenants
- File/path: `apps/web/src/app/(dashboard)/sales/[id]/page.tsx:52`
  (`SALES_ORDER_STATUSES.filter((s) => s !== o.status).map(...)`),
  `apps/web/src/app/(dashboard)/purchase-orders/[id]/page.tsx:57`,
  `apps/web/src/app/(dashboard)/production-orders/[id]/page.tsx:66`,
  `apps/web/src/app/(dashboard)/payroll/[id]/page.tsx:57` — each only excludes the *current* status,
  offering literally every other enum value as a one-click option (e.g. a `RECEIVED` Purchase Order can
  be one click away from being set back to `DRAFT`, per the backend's own documented lack of a state
  machine — see `DEVELOPMENT_LOG.md` D-022: "Sales/Purchase/Production order status changes are
  accepted for any value in the enum with no state-machine enforcement yet").
- Current behavior: the frontend does not compensate for the backend's known lack of transition rules
  by restricting which transitions it *offers* in the dropdown — it mirrors the full enum every time.
- Expected behavior: even without a full backend state machine, the frontend dropdown could reasonably
  filter to only the transitions that make sense from the current state (e.g. don't offer `DRAFT` from
  `RECEIVED`), reducing the surface for an accidental illogical transition, and should in any case route
  through `ConfirmDialog` (FE-003) before firing.
- Why it matters: combined with FE-003 (no confirmation) and D-022 (backend accepts anything), the
  frontend today is the *only* place that could prevent an obviously-wrong transition, and it doesn't
  attempt to.
- SRS reference: §6.1–§6.2 (order lifecycle intent), §17.4.
- Recommended fix: define an allowed-next-states map per status enum in each module's `api.ts` (a
  frontend-only mitigation, independent of whether the backend ever gets a real state machine) and
  filter the dropdown against it; combine with the FE-003 confirm-dialog fix.
- Test required: open a `RECEIVED` Purchase Order's status dropdown and confirm `DRAFT`/`PENDING_APPROVAL`
  are still offered (current expected-broken behavior).

#### [FE-014] Notifications bell has no loading indicator
- Severity: P3
- Module: notifications
- File/path: `apps/web/src/components/layout/topbar.tsx:76` (`const { data } = useNotifications();` —
  `isLoading` is not destructured or used anywhere in `NotificationsBell`).
- Current behavior: on first open (or on the initial 60s-interval fetch, per
  `DEVELOPMENT_LOG.md`'s description of polling), the dropdown shows the empty state ("No
  notifications yet.") until data arrives, rather than a loading indicator — indistinguishable from
  genuinely having zero notifications, for the brief window before the first fetch resolves.
- Expected behavior: show a small loading indicator (or skip rendering the empty-state text) while
  `isLoading` is true.
- Why it matters: minor, but it's the one place in the app's chrome (as opposed to a full page) where
  the loading/empty distinction from FE-001's broader pattern is visible on every single page load,
  since the topbar is always mounted.
- SRS reference: §17.4.
- Recommended fix: destructure `isLoading` from `useNotifications()` and render a small spinner or
  skip the "No notifications yet." text while loading.
- Test required: UNVERIFIED-IN-BROWSER — throttle the network and observe the bell dropdown's first
  render before the notifications request resolves.

### What's solid (confirmed, not just "looks correct")

- Auth bootstrap has no flash-of-unauthenticated-content bug (`use-auth-bootstrap.ts` +
  both root layouts) — traced the full `status` state machine and it is correct.
- `apiFetch`'s error handling is a single, consistent path that every mutation in every module uses
  identically via `toast.error`.
- Cache invalidation after mutations is universal (62 call sites, all 24 modules) — no stale-list risk
  found.
- No optimistic updates exist anywhere, so there is no optimistic-update rollback risk to report.
- List pages that do have pagination wire it to real server-side `page`/`pageSize`/`meta`, not a
  full-fetch-then-client-slice — `PaginationBar` itself is a correct, dumb renderer of server meta.
- `StatusBadge` always pairs color with text, so color is never the sole signal (a legitimate
  colorblind-accessibility baseline, even though FE-010 flags its coverage gaps).
- `Table`'s wrapper (`components/ui/table.tsx:8-11`) has `overflow-x-auto` built in, so wide tables are
  horizontally scrollable on narrow/touch screens rather than breaking layout.
- Permission-aware button gating (`can(Resource.X, Action.Y)`) is applied consistently for
  Create/Edit actions across all 24 modules — the only gap found is the page-level `PermissionGate`
  wrapper inconsistency (FE-005), not the gating logic itself.

All findings above are frontend-code-level observations; where a finding traces back to a known
backend limitation (e.g. D-022's lack of order-status state machine), this audit does not re-litigate
the backend fact and instead evaluates whether the frontend independently mitigates it (it mostly
doesn't — see FE-003/FE-013).

---

## 7. Database / Prisma Audit

*(Full findings from the dedicated Database/Prisma Audit stream; 57 models reviewed in full.)*

## Section 7 — Database / Prisma Audit

Scope: `prisma/schema.prisma` (57 models), `prisma/migrations/`, cross-referenced against
`SRS §17.1/§17.2` and spot-checked against `apps/api/src/**/*.service.ts` query/delete
patterns. Read-only audit — no files modified except this one.

---

### 0. `prisma validate` / `prisma migrate status` — exact output

```
$ npx prisma validate --schema=prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀

$ npx prisma migrate status --schema=prisma/schema.prisma
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "abytetex", schema "public" at "localhost:5432"

1 migration found in prisma/migrations

Database schema is up to date!
```

Only one migration exists: `20260911200241_init`. The schema is valid and the local
database matches it exactly — no drift.

---

### 1. SRS §17.1 core-entity traceability matrix

| SRS Domain | SRS Entity | Prisma Model | Exists Y/N | Notes |
|---|---|---|---|---|
| Platform/Tenancy | Tenant | `Tenant` | Y | |
| Platform/Tenancy | User | `User` | Y | |
| Platform/Tenancy | Role | `Role` | Y | |
| Platform/Tenancy | Permission | `Permission` | Y | |
| Platform/Tenancy | Factory | `Factory` | Y | |
| Platform/Tenancy | Department | `Department` | Y | |
| Platform/Tenancy | Warehouse | `Warehouse` | Y | |
| Platform/Tenancy | Location | `Location` | Y | |
| Commercial | Customer | `Customer` | Y | |
| Commercial | Supplier | `Supplier` | Y | |
| Commercial | Product | `Product` | Y | |
| Commercial | Material | `Material` | Y | |
| Commercial | SalesOrder | `SalesOrder` | Y | |
| Commercial | PurchaseOrder | `PurchaseOrder` | Y | |
| Production | ProductionOrder | `ProductionOrder` | Y | |
| Production | ProductionBatch | `ProductionBatch` | Y | |
| Production | ProcessRoute | `ProcessRoute` | Y | |
| Production | Machine | `Machine` | Y | |
| Production | MachineLog | `MachineLog` | Y | |
| Production | Downtime | `Downtime` | Y | |
| Inventory | Stock | `Stock` | Y | |
| Inventory | StockMovement | `StockMovement` | Y | |
| Quality & Maintenance | QualityInspection | `QualityInspection` | Y | |
| Quality & Maintenance | Defect | `Defect` | Y | |
| Quality & Maintenance | MaintenanceJob | `MaintenanceJob` | Y | |
| Workforce | Employee | `Employee` | Y | |
| Workforce | Shift | `Shift` | Y | |
| Workforce | Attendance | `Attendance` | Y | |
| Workforce | Incentive | `Incentive` | Y | |
| Finance & Logistics | CostSheet | `CostSheet` | Y | |
| Finance & Logistics | Dispatch | `Dispatch` | Y | |
| Platform Services | Notification | `Notification` | Y | |
| Platform Services | File | `FileAsset` | Y | **Renamed** — SRS says "File", schema uses `FileAsset` (avoids clash with Node/JS `File` global). Functionally equivalent. |
| Platform Services | AuditLog | `AuditLog` | Y | |
| Platform Services | SyncEvent | `SyncEvent` | Y | |

**Result: 32/32 SRS-named core entities exist. No missing entities.**

Models built beyond the SRS's core-entity table (reasonable elaborations implied by
workflow sections, not gaps): `SalesQuotation`/`SalesQuotationItem` (§6.1 quotations),
`PurchaseRequest`/`PurchaseRequestItem` (§6.2), `GoodsReceipt`/`GoodsReceiptItem` (§6.2),
`ProcessRouteStage` (§7.2 configurable stages), `MaterialConsumption` (§7.1),
`InspectionTemplate` (§9.1 checklists), `MaintenanceSchedule` (§9.3 preventive),
`PayrollPeriod`/`PayrollEntry` (§10.3), `ProductCategory`, `DispatchItem`,
`RefreshToken`/`PasswordResetToken`/`LoginHistory` (§5.1 sessions/security logs),
`UserRole`/`UserPermissionOverride`/`UserFactoryAccess` (§4.2/§5.1).

---

### 2. Detailed Findings

#### [DB-001] ProductionBatch — the core traceability entity has no soft delete and no delete protection
- Severity: P0
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, model `ProductionBatch` (line 996); migration lines 1429–1444, 1447–1450, 1555, 1633
- Current behavior: `ProductionBatch` has no `deletedAt` field. Every FK that references it — `MaterialConsumption.productionBatchId`, `QualityInspection.productionBatchId`, `CostSheet.productionBatchId` — is `ON DELETE SET NULL`. Nothing `RESTRICT`s deletion of a `ProductionBatch`.
- Expected behavior: The single entity the SRS calls out by name as providing "full production traceability" (§7.4) and as the pivot of the quality traceability chain (§9.2: "…→ Production Batch → Machine → Material Batch → Quality Inspection") should be the *hardest* record in the schema to lose, not one of the easiest.
- Why it matters: A single `prisma.productionBatch.delete()` call — accidental, buggy, or malicious — silently detaches every material consumption record, every quality inspection, and every cost sheet ever linked to that batch, with the database raising no error at all (SET NULL succeeds silently). There is no soft-delete fallback to recover from this. This directly breaks the exact traceability chain SRS §7.4/§9.2 mandate.
- SRS reference: §7.4 ("full production traceability"), §9.2 (traceability chain), §17.2 ("avoid unnecessary hard deletion; use soft deletion where required").
- Recommended fix: Add `deletedAt DateTime?` to `ProductionBatch` and enforce it in the service layer (no hard-delete endpoint should exist); additionally consider `onDelete: Restrict` on `MaterialConsumption`/`QualityInspection`/`CostSheet` → `ProductionBatch` so even a rogue hard-delete attempt fails loudly instead of silently orphaning data.
- Test required: Attempt to hard-delete a `ProductionBatch` that has linked `MaterialConsumption`/`QualityInspection`/`CostSheet` rows and assert it is rejected (after the fix) or, at minimum, add a regression test proving current behavior silently nulls the links (documenting the risk if the fix is deferred).

#### [DB-002] Stock's composite unique constraint does not actually prevent duplicate balance rows (Postgres NULL semantics)
- Severity: P0
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, model `Stock` (line 1173), `@@unique([warehouseId, locationId, productId, materialId, batchNumber])`; migration line 1177; corroborated in `apps/api/src/inventory/inventory.service.ts` lines 76–99
- Current behavior: `locationId`, `productId`, `materialId`, and `batchNumber` are all nullable. In PostgreSQL, `NULL` is never equal to `NULL` for the purposes of a unique constraint, so two `Stock` rows with the same `warehouseId` + `productId` but both `locationId = NULL` (the common case — most stock isn't assigned a specific rack/bin) are **not** blocked by this constraint and can both exist simultaneously. `inventory.service.ts` does not rely on the DB constraint anyway — it does an application-level `findFirst(...)` then `update`/`create` (lines 76–99), which is a classic time-of-check-to-time-of-use race: two concurrent stock-affecting requests (e.g., two goods receipts posted at once) can both miss the existing row and both `create`, producing two `Stock` rows for what should be one on-hand balance.
- Expected behavior: Exactly one `Stock` row per (warehouse, location-or-none, product-or-material, batch-or-none) combination, enforced by the database, with concurrent writes serialized so on-hand quantity is never split or double-counted.
- Why it matters: Inventory accuracy is a headline SRS objective (§2.2 "Reduce material wastage and improve inventory accuracy"; §21 "Inventory accuracy" as a success metric). A split/duplicated `Stock` row means dashboards, low-stock alerts, and the derived "on-hand" figure silently diverge from reality — the exact failure mode multi-tenant textile ERPs are built to prevent.
- SRS reference: §2.2, §8.1, §8.3 ("Stock shall never be changed silently"), §21, §17.2 ("use transactions for critical operations").
- Recommended fix: Replace the four nullable "identity" columns' NULLs with a sentinel value (e.g. an empty string `''` or a fixed placeholder id) so the unique index is enforceable, or add partial unique indexes per null-combination, or switch to `prisma.stock.upsert()` inside a `SERIALIZABLE`/row-locked transaction keyed off the sentinel-normalized tuple. At minimum wrap the existing find-then-write in `SELECT ... FOR UPDATE` inside the transaction.
- Test required: Fire two concurrent stock-receive requests for the same warehouse+product with no location/batch and assert exactly one `Stock` row results with the combined quantity, not two rows.

#### [DB-003] Product/Material hard-delete silently strips product/material identity from historical Stock and StockMovement rows
- Severity: P0
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `Stock.productId`/`materialId` (lines 1182–1185), `StockMovement.productId`/`materialId` (lines 1219–1222); migration lines 1501, 1504, 1516, 1519
- Current behavior: `stock_productId_fkey`, `stock_materialId_fkey`, `stock_movements_productId_fkey`, `stock_movements_materialId_fkey` are all `ON DELETE SET NULL`. `Product` and `Material` both have a `deletedAt` column (soft-delete scaffolding exists), but nothing at the database level stops a hard `DELETE`/`prisma...delete()` on either.
- Expected behavior: The append-only `StockMovement` ledger is documented in the schema itself as "the unbroken audit trail required by SRS §8.3" — historical rows must never lose their meaning.
- Why it matters: If a `Product` or `Material` is ever hard-deleted (no DB-level barrier currently exists), every historical `StockMovement` row that referenced it retroactively loses its product/material identity (`productId`/`materialId` becomes `NULL`), turning a supposedly permanent audit trail into anonymous, unusable rows. This is the opposite of "unbroken."
- SRS reference: §8.3 ("Every significant stock movement shall generate a transaction record, preserving an unbroken audit trail… Stock shall never be changed silently"), §17.2.
- Recommended fix: Change `stock_movements_productId_fkey`/`materialId_fkey` to `onDelete: Restrict` (a ledger row referencing a product should block that product's hard delete outright), and rely on `deletedAt` soft-delete for `Product`/`Material` archival instead of ever allowing a hard delete once movement history exists.
- Test required: Attempt to hard-delete a `Product` with existing `StockMovement` history and assert it is rejected once `Restrict` is applied; today, assert (and flag) that it currently succeeds and nulls the references.

#### [DB-004] `deletedAt` soft-delete columns exist on 10 models but are dead code — nothing sets them, almost nothing reads them, and no delete endpoints exist for the audited modules
- Severity: P0
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` — `deletedAt` present on `User`, `Factory`, `Warehouse`, `Customer`, `Supplier`, `Product`, `Material`, `SalesOrder`, `Machine`, `Employee`; corroborated via repo-wide search of `apps/api/src`
- Current behavior: A repo-wide grep for `deletedAt:` (i.e., anywhere the field is *set*) across `apps/api/src` returns **zero matches** — the column is never written by any service. A grep for `deletedAt` reads returns only 3 lines, all in the login/auth flow checking `User.deletedAt` (`auth.service.ts`, `jwt.strategy.ts`) — no other model's `deletedAt` is ever checked in a `where` clause anywhere (confirmed for `products.service.ts`, `customers.service.ts`, `sales.service.ts` directly, and by the same grep pattern across the whole `apps/api/src` tree). Additionally, `products.service.ts`, `customers.service.ts`, and `sales.service.ts` have **no delete/remove method or DELETE endpoint at all** — there is currently no code path, soft or hard, that removes a Product, Customer, or Sales Order.
- Expected behavior: Per SRS §17.2 ("avoid unnecessary hard deletion; use soft deletion where required"), the audited modules should expose a delete/deactivate action that sets `deletedAt`, and every list/lookup query on a soft-deletable model should filter `deletedAt: null` by default.
- Why it matters: The schema *looks* like it implements the SRS's soft-delete rule, but it doesn't — this is a scaffolding-without-wiring gap. If any developer later adds a naive hard-delete endpoint (as would be the obvious/fast way to satisfy a "delete product" ticket), there is nothing in the codebase today establishing the soft-delete convention as the norm, and no query currently protects against a soft-deleted row (if one somehow got set) still showing up in lists, quotes, or new sales orders.
- SRS reference: §17.2, §22 (MVP acceptance criteria implies full CRUD including delete for master data).
- Recommended fix: Either implement soft-delete `remove()` methods (setting `deletedAt`, excluding it from `findMany`/`findUnique` by default) for every model that carries the column, or remove the unused `deletedAt` columns and document that these entities use the `status` enum (`INACTIVE`/`DISCONTINUED`/`ARCHIVED`) as the sole deactivation mechanism instead, to avoid two competing, half-implemented patterns.
- Test required: For each of the 10 models, verify a `remove()`/deactivate path exists, sets `deletedAt`, and that subsequent list/detail queries exclude the row by default.

#### [DB-005] Polymorphic `referenceType`/`referenceId` pairs (StockMovement, FileAsset) have zero referential integrity
- Severity: P1
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `StockMovement.referenceType`/`referenceId` (lines 1228–1229), `FileAsset.referenceType`/`referenceId` (lines 1707–1708), `AuditLog.entityType`/`entityId` (lines 1742–1743), `Notification.referenceType`/`referenceId` (lines 1674–1675)
- Current behavior: These are plain `String?` pairs, not Prisma relations — there is no FK, no cascade, no restrict. They point at rows in `GoodsReceipt`, `Dispatch`, `ProductionBatch`, etc. by convention only.
- Expected behavior: Given DB-001/DB-003/DB-008 show several of the entities these fields point at (`GoodsReceipt`, `Dispatch`, `ProductionBatch`) have no soft-delete protection, a hard delete of any of them leaves these polymorphic references pointing at nothing, with no DB mechanism to detect or prevent it.
- Why it matters: `StockMovement` is explicitly the audit ledger required by SRS §8.3; if its `referenceId` can silently dangle, the ledger can no longer reliably answer "which goods receipt/dispatch/batch produced this movement" — undermining the traceability the whole table exists for. This is an accepted, common Prisma trade-off for polymorphic relations, but it compounds with the missing soft-delete protection on the referenced tables (DB-001, DB-008) to become a real risk here specifically.
- SRS reference: §8.3, §15.2.
- Recommended fix: At minimum, ensure the referenced tables (`GoodsReceipt`, `Dispatch`, `ProductionBatch`, `MaintenanceJob`, etc.) are never hard-deletable (soft-delete only) so the polymorphic pointers stay valid even though they're not FK-enforced. Longer-term, consider separate strongly-typed nullable FK columns per reference type instead of a single polymorphic pair, if the reference type set is small and stable.
- Test required: Soft-delete (not hard-delete) a `GoodsReceipt` that has `StockMovement` rows pointing at it and confirm the movement history remains resolvable.

#### [DB-006] SalesOrder → ProductionOrder link is `SET NULL` on delete, breaking the mandated Customer-Order → Production-Order chain
- Severity: P1
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `ProductionOrder.salesOrderId` (line 954); migration line 1405 (`production_orders_salesOrderId_fkey … ON DELETE SET NULL`)
- Current behavior: `SalesOrder` has a `deletedAt` field (soft-delete scaffolding, itself unused per DB-004) but the DB-level FK from `ProductionOrder` back to it is `SET NULL`, not `Restrict`.
- Expected behavior: SRS §9.2 explicitly mandates a traceable chain "Customer Order → Production Order → Production Batch → …". A hard delete of a `SalesOrder` that already has one or more `ProductionOrder`s should be either blocked, or the loss of the link should at least be a conscious, audited decision — not a silent `NULL`.
- Why it matters: Today, nothing in the API implements sales-order deletion (per DB-004), so this is currently latent, not exploited — but the schema itself does not enforce the traceability guarantee the SRS requires, and would silently break it the moment a delete path is added.
- SRS reference: §9.2, §6.1 (order status flow / order history).
- Recommended fix: Change `production_orders_salesOrderId_fkey` to `onDelete: Restrict` so a `SalesOrder` with production history cannot be hard-deleted; rely on `deletedAt` for archival.
- Test required: Create a `SalesOrder` → `ProductionOrder`, hard-delete the sales order, and (after fix) assert the delete is rejected.

#### [DB-007] Tenant's own child relations are inconsistently protected — Users/Roles can outlive tenant deletion while everything else blocks it
- Severity: P1
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `User.tenantId` (line 128), `Role.tenantId` (line 217); migration lines 1237 (`users_tenantId_fkey … ON DELETE SET NULL`), 1249 (`roles_tenantId_fkey … ON DELETE SET NULL`), versus lines 1270, 1279, 1294, 1297, 1306, 1315, 1327, etc. (`ON DELETE RESTRICT` for `Factory`, `Warehouse`, `Customer`, `Supplier`, `Product`, `SalesOrder`, and effectively every other tenant-scoped table)
- Current behavior: Virtually every tenant-scoped table's `tenantId` FK is `ON DELETE RESTRICT` — a `Tenant` cannot be hard-deleted while it has any `Factory`, `Customer`, `Product`, `SalesOrder`, etc. But `User.tenantId` and `Role.tenantId` are `ON DELETE SET NULL`.
- Expected behavior: Consistent protection — either all tenant-owned data blocks tenant deletion, or none of it does (with a deliberate cascade/export strategy for tenant offboarding).
- Why it matters: A tenant that has been fully offboarded of business data (no factories/products/customers left) but still has `User` and `Role` rows could be hard-deleted today, and those `User`/`Role` rows would silently flip to `tenantId = NULL` — the same shape as a platform-level user/role. Combined with `isPlatformAdmin` defaulting to `false`, this wouldn't grant platform access outright, but it creates orphaned, ownerless accounts and roles sitting in a "no tenant" state that RBAC/login logic may not have been designed to handle safely, and is inconsistent with the RESTRICT-everywhere pattern used for every other Tenant relation.
- SRS reference: §3.3 (tenant isolation is mandatory), §17.2.
- Recommended fix: Change `users_tenantId_fkey` and `roles_tenantId_fkey` to `onDelete: Restrict` for consistency with the rest of the Tenant relations (a tenant offboarding flow should explicitly delete/anonymize its users and roles first, in a transaction, not rely on cascading FK behavior).
- Test required: Create a Tenant with only a User and a Role (no other business data), attempt to hard-delete the Tenant, and (after fix) assert it is rejected until the User/Role are removed first.

#### [DB-008] Five parent tables cascade-delete audit/financial/quality detail rows and have no soft-delete field of their own
- Severity: P1
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` — `GoodsReceipt` (no `deletedAt`, line 847) → `GoodsReceiptItem` `onDelete: Cascade` (line 874); `Dispatch` (no `deletedAt`, line 1249) → `DispatchItem` `onDelete: Cascade` (line 1281); `QualityInspection` (no `deletedAt`, line 1332) → `Defect` `onDelete: Cascade` (line 1378); `PayrollPeriod` (no `deletedAt`, line 1564) → `PayrollEntry` `onDelete: Cascade` (line 1589); `PurchaseOrder` (no `deletedAt`, line 790) → `PurchaseOrderItem` `onDelete: Cascade` (line 824)
- Current behavior: All five parents can be hard-deleted (no soft-delete column, no schema-level barrier beyond incidental protection — e.g. `GoodsReceiptItem` is itself `Restrict`-referenced by nothing, but `PurchaseOrderItem` is referenced by `GoodsReceiptItem.purchaseOrderItemId` with `onDelete: Restrict`, which only accidentally blocks a `PurchaseOrder` delete if goods have already been received against it). Deleting any of these five parents cascades away the detail rows: received/accepted/rejected quantities, dispatch roll/package details, quality defects, and payroll line items.
- Expected behavior: `QualityInspection`/`Defect` are quality-traceability data (SRS §9.1/§9.2); `GoodsReceipt`/`Dispatch` are the entry and exit points of the inventory audit chain (SRS §8.3: "Purchase → Goods Receipt → Warehouse Stock → … → Dispatch"); `PurchaseOrder`/`PayrollEntry` are financial records. None of these should be hard-deletable once real transactions exist against them.
- SRS reference: §8.3, §9.1/§9.2, §11 (costing/financial accuracy), §17.2.
- Recommended fix: Add `deletedAt` to all five models and route deletion through it; keep the `Cascade` on the item tables (appropriate once the parent itself is soft-deleted, not hard-deleted).
- Test required: For each of the five, create a parent + child rows, hard-delete the parent, and (after fix) confirm it's rejected/soft-deleted instead of cascading a hard delete.

#### [DB-009] Actor fields recorded as un-enforced strings instead of FKs to User
- Severity: P2
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` — `StockMovement.createdBy` (line 1231, `String`, no relation), `PurchaseRequest.requestedBy` (line 751), `QualityInspection.inspectedBy` (line 1347), `PayrollPeriod.approvedBy` (line 1574, `String?`)
- Current behavior: These record a `User.id` by convention only — no `@relation`, no FK constraint. This is a documented, intentional trade-off (schema header comment: "no enforced FK to keep write-paths cheap — see IMPLEMENTATION_DECISIONS.md D-005"). Contrast with `FileAsset.uploadedBy`, `AuditLog.userId`, and `Notification.userId`, which *are* proper relations.
- Expected behavior: SRS §17.2 says "use foreign keys… throughout." These four fields are on exactly the tables the SRS cares most about for traceability/audit (the stock ledger, procurement request trail, quality inspection record, payroll approval).
- Why it matters: Without an FK, nothing prevents `createdBy`/`requestedBy`/`inspectedBy`/`approvedBy` from referencing a deleted or nonexistent `User` id, and nothing stops a typo'd id from being silently accepted. It also means these fields can't be safely used in a Prisma `include`/join without an extra manual lookup.
- SRS reference: §17.2, §8.3, §15.2.
- Recommended fix: If write-path cost is the real concern, at minimum validate the user id exists in the service layer before insert (cheap read, already likely done for auth) — or add the FK with `onDelete: Restrict` (an audit-relevant actor reference should block user hard-deletion anyway, which the schema already does for `User` broadly since nothing hard-deletes `User` either).
- Test required: Insert a `StockMovement`/`QualityInspection`/`PurchaseRequest` with a `createdBy`/`inspectedBy`/`requestedBy` value that doesn't correspond to any `User` and confirm whether it's accepted (documenting the current gap) or rejected (after a fix).

#### [DB-010] No database-level tenant-isolation backstop; spot-checked service queries filter by `id` alone
- Severity: P1
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` (no Postgres Row-Level Security, no tenant-scoped composite FKs enforcing parent/child tenant match); corroborated in `apps/api/src/products/products.service.ts` (`getById`/`update`, lines 57–61, 63–79), `apps/api/src/customers/customers.service.ts` (`getById`/`update`, lines 47–51, 53–64), `apps/api/src/sales/sales.service.ts` (`getById`, lines 111–122) — all call `findUnique({ where: { id } })` / `update({ where: { id }, ... })` with no `tenantId` in the filter
- Current behavior: Tenant isolation (SRS §3.3, a mandatory, security-critical requirement) is enforced *only* by application code deciding to add a `tenantId` filter — nothing in the schema or database enforces it. Three spot-checked modules' single-record read/update paths filter by primary key alone.
- Expected behavior: SRS §3.3: "Each tenant's data shall remain completely isolated from every other tenant… The backend shall never trust a tenant_id supplied directly by the frontend… Tenant context shall always be resolved from the authenticated user's session." A database-architecture review should note that nothing here provides defense-in-depth if application-layer tenant checks are ever missed, reordered, or bypassed.
- Why it matters: This is fundamentally an application/RBAC-layer bug pattern rather than a schema defect, and a dedicated API/security-focused section of this audit is the right place for a full sweep of every `findUnique`/`update`/`delete` call across all modules — flagged here because it is a *database-architecture* gap (no DB-level safety net such as Postgres RLS policies keyed on `tenantId`, no CHECK/composite-FK enforcing that a child row's `tenantId` matches its parent's) that the SRS's own "single PostgreSQL database, multi-tenant" architecture (§17.1) explicitly anticipates needing "strict logical isolation enforced in the application and data layers" (§3.2) — the *data layer* half of that sentence is currently absent.
- SRS reference: §3.2, §3.3, §17.1.
- Recommended fix: Either adopt Postgres Row-Level Security with `tenantId` session variables as a second line of defense, or, at minimum, establish and lint-enforce a repo-wide convention that every single-record `findUnique`/`update`/`delete` includes `tenantId` in its `where` clause (Prisma doesn't support composite-unique-with-partial-key lookups by default, so this likely means switching these to `findFirst({ where: { id, tenantId } })`). Full verification of the blast radius belongs to the API/security section of this audit.
- Test required: (Flagging for the security/API audit section) Attempt to fetch/update a resource by ID while authenticated as a different tenant and confirm it is rejected.

#### [DB-011] Stock/StockMovement polymorphic product-or-material columns have no CHECK constraint
- Severity: P2
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `Stock.productId`/`materialId` (lines 1182–1185), `StockMovement.productId`/`materialId` (lines 1219–1222)
- Current behavior: Both columns are nullable on both models, intended as "exactly one of product-or-material identifies this row," but nothing enforces that. A row with both `NULL` (unidentified stock) or both set (ambiguous — is it a product or a material row?) is accepted by the database.
- Expected behavior: A `CHECK` constraint (or equivalent application-layer validation consistently applied) guaranteeing exactly one of the two is populated.
- Why it matters: Inventory reports/dashboards (SRS §12.4) that branch on "is this a product row or a material row" would silently mishandle a malformed row (e.g., skip it, or double count it in "raw material" and "finished goods" totals).
- SRS reference: §8.1, §12.4, §17.2.
- Recommended fix: Add `CONSTRAINT chk_stock_product_xor_material CHECK ((productId IS NOT NULL) <> (materialId IS NOT NULL))` (Prisma doesn't generate CHECK constraints natively — add via a manual migration edit) to both `stock` and `stock_movements` tables.
- Test required: Attempt to insert a `Stock`/`StockMovement` row with both `productId` and `materialId` null, and with both set, and confirm both are rejected once the constraint is added.

#### [DB-012] Line-item/detail tables systemically lack `createdAt`/`updatedAt`
- Severity: P2
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` — `SalesQuotationItem` (line 652), `SalesOrderItem` (line 716), `PurchaseRequestItem` (line 765), `PurchaseOrderItem` (line 821), `GoodsReceiptItem` (line 871), `DispatchItem` (line 1278), `Defect` (line 1375): none of these seven models has either `createdAt` or `updatedAt`. `MaterialConsumption` (line 1039) has `createdAt` only, no `updatedAt`.
- Current behavior: No timestamp columns on any of the above.
- Expected behavior: SRS §17.2: "Use timestamps and maintain audit information" — applied throughout, not just at the header/parent-row level.
- Why it matters: Several of these are mutated *after* creation, not just created once: `PurchaseOrderItem.receivedQty`/`rejectedQty` change as partial goods receipts come in over the life of a PO (SRS §6.2 "Rejected quantities," "Pending purchases"); `SalesOrderItem.deliveredQty` changes across partial deliveries (SRS §6.1 "Partial delivery"). With no `updatedAt`, there is no way to know when a partial-receipt or partial-delivery update happened, which undermines both operational reporting (e.g., "orders updated today") and any future audit reconciliation.
- SRS reference: §17.2, §6.1, §6.2.
- Recommended fix: Add `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` to all eight models listed (at minimum `updatedAt` on `SalesOrderItem` and `PurchaseOrderItem`, which are the two known to mutate post-creation).
- Test required: Partially receive a `PurchaseOrder` line item twice and confirm (after fix) `updatedAt` reflects the second receipt's timestamp.

#### [DB-013] No supporting indexes for the `tenantId + status` / `tenantId + factoryId + status` dashboard and list-query patterns actually used in the service layer
- Severity: P2
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` — `SalesOrder`, `PurchaseOrder`, `PurchaseRequest`, `GoodsReceipt`, `ProductionOrder`, `Dispatch`, `MaintenanceJob`, `QualityInspection` each have only the index implied by their `@@unique([tenantId, <businessNumber>])` constraint; none has an `@@index` covering `status`, `factoryId`, or `createdAt` filtering. Confirmed against actual usage in `apps/api/src/sales/sales.service.ts` `list()` (lines 84–96), which builds `where: { factoryId, status, ... }` with **no index on `factoryId` or `status` at all** on `sales_orders` (only `tenantId+orderNumber` is indexed).
- Current behavior: At current (pre-launch/pilot) data volumes this is invisible; per SRS §16.3 the platform is meant to scale to "100+ Tenants → … → Millions of Transactions," at which point a `factoryId`+`status` filter with no index becomes a full sequential scan per query.
- Expected behavior: SRS §16.2: "Database queries shall be indexed appropriately," specifically in the context of dashboards (§12.1 "pending orders," §12.2 "delayed orders," §12.6 "open maintenance jobs / breakdown machines").
- Why it matters: This is a performance/scalability gap rather than a correctness gap, but it is explicitly called out by the SRS as a non-functional requirement, and the query patterns that will hit it are already present in the shipped code (`sales.service.ts`), not hypothetical.
- SRS reference: §16.2, §16.3, §12 (all dashboard subsections).
- Recommended fix: Add `@@index([tenantId, factoryId, status])` (or `[tenantId, status]` where `factoryId` isn't always present) to `SalesOrder`, `PurchaseOrder`, `PurchaseRequest`, `ProductionOrder`, `Dispatch`, `MaintenanceJob`, `QualityInspection`, `GoodsReceipt`.
- Test required: `EXPLAIN ANALYZE` the `sales.service.ts` `list()` query with a `factoryId`+`status` filter before/after adding the index at a seeded volume of ~100k `sales_orders` rows.

#### [DB-014] `ProductCategory` tenant-scoped unique constraint doesn't block duplicate root-level category names
- Severity: P2
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `ProductCategory` (line 516), `@@unique([tenantId, name, parentId])` (line 531)
- Current behavior: `parentId` is nullable. Postgres unique constraints treat every `NULL` as distinct, so two `ProductCategory` rows with the same `tenantId` and `name` and `parentId = NULL` (i.e., two root-level categories with the same name) are **not** blocked.
- Expected behavior: A tenant should not be able to create two top-level categories both named e.g. "Yarn."
- Why it matters: Minor data-quality issue (duplicate dropdown entries, ambiguous category filtering) rather than a financial/audit risk.
- SRS reference: §5.4.1, §17.2 ("tenant-scoped unique constraints").
- Recommended fix: Normalize `parentId` to a sentinel (e.g. `''`) instead of `NULL` for root categories, or add application-layer validation checking for an existing root category with the same name before create.
- Test required: Create two root-level `ProductCategory` rows with the same tenant + name and confirm the current behavior allows it; add a regression test once fixed.

#### [DB-015] Float used for textile measurement fields that may feed downstream calculations
- Severity: P3
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` — `Product.gsm`/`Product.width` (lines 555–556), `QualityInspection.gsm`/`width`/`rollLength`/`weight` (lines 1351–1355)
- Current behavior: These six fields are `Float` (Postgres `double precision`), while every money/quantity field elsewhere in the schema (57 fields checked) correctly uses `Decimal` with explicit precision/scale. No money field uses `Float` — that part of the schema is clean.
- Expected behavior: For consistency with the rest of the schema's numeric-precision discipline, and because GSM/width/roll-length/weight are textile measurements that could plausibly feed area- or weight-based costing calculations (SRS §11: cost per unit), binary floating point is a latent rounding-drift risk if these values are ever summed or multiplied at scale.
- Why it matters: Lower severity than the money fields (none of which have this problem) because these are currently descriptive/inspection fields, not accumulated ledger values — but worth fixing before any costing formula starts consuming them directly.
- SRS reference: §5.4.1, §9.1, §11.
- Recommended fix: Change to `Decimal @db.Decimal(8, 2)` (GSM/weight) and `Decimal @db.Decimal(8, 2)` (width/roll length) for consistency, if/when these are used in calculations; low urgency if they remain purely descriptive/display fields.
- Test required: N/A until these fields are consumed in a calculation; add a precision-regression test at that point.

#### [DB-016] Purchase line items can reference no material at all
- Severity: P2
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `PurchaseRequestItem.materialId` (line 769, `Material?`), `PurchaseOrderItem.materialId` (line 825, `Material?`)
- Current behavior: `materialId` is nullable on both line-item models, with no compensating free-text description field for the case where it's absent.
- Expected behavior: Every procurement line item should identify what is being requested/ordered — either via `materialId` or an explicit description field for non-catalog items.
- Why it matters: A `PurchaseOrderItem` with `materialId = NULL` records only a quantity/unit/price with no way to know what was purchased — a real gap in the procurement audit trail SRS §6.2 requires ("Purchase history," "Pending purchases").
- SRS reference: §6.2, §17.2.
- Recommended fix: Either make `materialId` required, or add a `description String?` field required when `materialId` is null (with a CHECK or app-layer validation), for non-catalog/service purchase lines.
- Test required: Create a `PurchaseOrderItem` with `materialId: null` and no description and confirm it's currently accepted; add validation and a regression test.

#### [DB-017] `Permission` has no timestamps
- Severity: P3
- Module: Database/Prisma
- File/path: `prisma/schema.prisma`, `Permission` (line 247)
- Current behavior: No `createdAt`/`updatedAt` on the (role, resource, action) permission-grant table.
- Expected behavior: SRS §17.2 "use timestamps… throughout"; SRS §15.2 explicitly lists "Permission changes" as a mandatory audit-log category.
- Why it matters: Low severity because `AuditLog` (§15.2) is the system of record for *when* a permission changed, not the `Permission` table itself — this is a minor consistency gap, not a functional one.
- SRS reference: §17.2, §15.2.
- Recommended fix: Add `createdAt DateTime @default(now())` for consistency with every other model, low priority.
- Test required: None required beyond a schema review checklist item.

#### [DB-018] The large majority of relations rely on Prisma's implicit `onDelete`/`onUpdate` defaults rather than an explicit declaration
- Severity: P3
- Module: Database/Prisma
- File/path: `prisma/schema.prisma` — of roughly 150 `@relation` fields, the great majority (all `tenantId`, most master-data FKs) have no explicit `onDelete`/`onUpdate` clause and rely on Prisma's default (`Restrict` for required relations, `SetNull` for optional ones, confirmed against the generated migration SQL, which is correct/safe for essentially all of them today).
- Current behavior: The defaults that were generated (visible in `migration.sql`) are, on inspection, mostly sound — this audit's other findings (DB-001, DB-003, DB-006, DB-007, DB-008) are about specific relations where the *default itself* (`SetNull`/`Cascade`) is the wrong choice for the data's importance, not about the defaulting mechanism being broken in general.
- Expected behavior: Per this audit's brief and general Prisma guidance, referential actions on business-critical relations should be explicit in the schema source, not inferred, so a reviewer (or a future Prisma major-version change, or a relation's nullability being edited later) can't silently change delete behavior on an audit-relevant table without it being visible in a diff.
- Why it matters: This is a maintainability/auditability concern rather than an active bug — flagged so that the fixes recommended in DB-001/003/006/007/008 (and any future ones) are made explicit in the schema text, closing the door on "the default happened to save us this time."
- SRS reference: §17.2.
- Recommended fix: Add explicit `onDelete`/`onUpdate` to every relation, starting with the ones already identified as needing a *different* value than their current default (DB-001, DB-003, DB-006, DB-007, DB-008), then sweep the rest for documentation value.
- Test required: None beyond the fixes already required by the specific findings above; consider a lint/CI check requiring explicit `onDelete` on all `@relation` fields going forward.

---

### Summary by severity

| Severity | Count | IDs |
|---|---|---|
| P0 | 4 | DB-001, DB-002, DB-003, DB-004 |
| P1 | 5 | DB-005, DB-006, DB-007, DB-008, DB-010 |
| P2 | 6 | DB-009, DB-011, DB-012, DB-013, DB-014, DB-016 |
| P3 | 3 | DB-015, DB-017, DB-018 |
| **Total** | **18** | |

### Things done right (for balance)

- Every `Decimal` field in the schema (57 checked) has an explicit `@db.Decimal(p, s)` — no bare `Decimal`, and no money/quantity field uses `Float`. Precision/scale choices (14,2 for currency, 14,3 for textile quantities, 5,2 for percentages, 14,4 for per-unit cost) are all reasonable for the domain.
- Every business-unique identifier the SRS calls out by name (SKU, order numbers, material/machine/employee codes) is correctly tenant-scoped via a composite `@@unique([tenantId, ...])`, not a bare unique — the exact failure mode the audit brief warned about (`ABC123` blocked across tenants) does **not** occur anywhere in this schema.
- `Factory` is comprehensively protected — every one of its ~13 dependent tables uses `onDelete: Restrict` on `factoryId`, so a factory with any real operational data cannot be hard-deleted.
- `StockMovement`/`AuditLog` have sensible compound indexes matching their actual query shape (`[tenantId, productId]`, `[tenantId, referenceType, referenceId]`, `[tenantId, entityType, entityId]`, `[tenantId, createdAt]`).
- 32/32 SRS §17.1 core entities exist in the schema (see traceability table above) — no missing entities.
- The schema is valid and migrations are in sync with the live database (`prisma validate` / `migrate status`, both clean).

---

## 8. Multi-Tenancy Security Audit

*(Findings TEN-001 through TEN-006, plus explicit tenant-isolation test scenarios, from the dedicated Multi-Tenancy/RBAC/Auth Audit stream.)*

### Summary

- Findings: 12 total — **1 P0**, **2 P1**, **6 P2**, **3 P3**.
- **Most critical finding: RBAC-001 (P0) — factory-level access (`UserFactoryAccess`/`factoryIds`) is computed at login but never enforced by any backend service.** A user whose access is restricted to Factory 01 can fully read and write every other factory's machines, employees, warehouses, and (by the same missing pattern) production/attendance/downtime data within their own tenant. This is not a cross-tenant leak (tenant isolation itself holds), but it is a complete bypass of the factory-access control SRS §5.3/§4.1 requires, and it fails "closed... except not really" — the JWT/session payload advertises a restriction (`factoryIds`) the API silently never checks.
- **Second most critical: TEN-001 (P0) — the Quality Dashboard leaks cross-tenant business data.** `DashboardsService.getQualityDashboard()` calls `prisma.raw.defect.groupBy(...)` with no `where` clause at all, aggregating defect-type counts across **every tenant on the platform**, not just the caller's. Every other query in that same file correctly uses `prisma.db` (tenant-scoped); this one line uses the unscoped escape hatch instead, directly contradicting SRS §22's "cross-tenant access is impossible" acceptance criterion.
- Multi-tenancy fundamentals are otherwise solid: the `TenantContextInterceptor` / `AsyncLocalStorage` design correctly wraps the entire controller+service+Prisma call chain (confirmed via `app.module.ts` provider order — guards run first and don't touch Prisma, then `TenantContextInterceptor` wraps `next.handle().subscribe()`, which covers `ResponseInterceptor` and everything downstream). The Prisma extension correctly rewrites `where` for `findUnique`/`findFirst`/`update`/`delete` (not just `create`), so **cross-tenant IDOR via ID-guessing is prevented, not just cross-tenant LIST** — this was explicitly checked and is a real, confirmed positive.

---

## PART A — Multi-Tenancy Deep Audit

#### [TEN-001] Quality Dashboard aggregates defect data across all tenants
- Severity: P0
- Module: Multi-Tenancy
- File/path: `apps/api/src/dashboards/dashboards.service.ts:141-161` (`getQualityDashboard`, line 144)
- Current behavior: Every query in `DashboardsService` uses `this.prisma.db.*` (tenant-scoped) **except** `getQualityDashboard()`'s `topDefects` query, which calls `this.prisma.raw.defect.groupBy({ by: ['defectType'], _count: true, orderBy: {...}, take: 5 })` with no `where` clause whatsoever. `Defect` has no `tenantId` column of its own (it inherits scope from its parent `QualityInspection` via `qualityInspectionId`, per the intentional "child model" pattern documented in `tenant-scoped-models.ts`), so bypassing `.db` here bypasses tenant scoping entirely — the query engine has no tenant boundary to apply.
- Expected behavior: `topDefects` should be scoped to the caller's tenant, e.g. `this.prisma.db.qualityInspection.findMany(...)` grouped by defect, or `this.prisma.raw.defect.groupBy({ where: { qualityInspection: { tenantId: ctx.tenantId } }, ... })` if `.raw` must be kept for the `groupBy`-on-a-non-tenant-model shape.
- Why it matters: Any authenticated tenant user with `report:view` permission (which is the default for nearly every role, including `VIEWER`) sees a "Top Defects" widget mixing in defect-type frequency data from every other tenant on the platform — including competitors in the same Faisalabad textile market this product targets. This is a direct violation of SRS §3.3 ("Each tenant's data shall remain completely isolated") and §22's MVP acceptance criterion "Cross-tenant access is impossible."
- SRS reference: §3.3 Tenant Data-Isolation Rules; §22 MVP Acceptance Criteria ("Cross-tenant access is impossible"); §12.5 Quality Dashboard.
- Recommended fix: Scope the `defect.groupBy` call to the current tenant by filtering through `qualityInspection.tenantId`, or restructure as a `.db`-scoped query. Add a lint rule / code-review checklist item: any `.raw.<childModel>.*` call on a model not in `TENANT_SCOPED_MODELS` must include an explicit tenant filter through its parent relation.
- Test required: See TENANT-ISOLATION-TEST-3 below.

#### [TEN-002] Cross-tenant user-existence enumeration via invite-user duplicate-email check
- Severity: P2
- Module: Multi-Tenancy
- File/path: `apps/api/src/users/users.service.ts:38-39` (`inviteUser`)
- Current behavior: `const existing = await this.prisma.raw.user.findUnique({ where: { email: dto.email } })` checks for a duplicate email **across the entire platform**, not just the calling tenant, and returns `409 Conflict` ("A user with email ... already exists") if found. `User.email` is indeed a globally `@unique` column in `prisma/schema.prisma` (line 130), so this specific `.raw` call is arguably required by the actual DB constraint — but it means a Company Admin/Owner in Tenant A can send speculative `POST /users` invites for guessed emails and learn, via the 409 vs. 201 response, whether that email already has an account in **any** tenant (e.g. a competitor's factory).
- Expected behavior: Either (a) accept that email is intentionally a platform-wide unique identifier (common SaaS pattern) and document this as a deliberate, bounded exception to §3.3 rather than an oversight, or (b) return a generic, non-distinguishing response (e.g. always 202/204 "invite processed" and let the real duplicate-handling happen out-of-band/via email) if cross-tenant email-existence must not be observable.
- Why it matters: Low-severity but real information leak — confirms the existence of a named individual's account at a competitor's tenant, which in a small regional industry (Faisalabad textile manufacturers) can itself be sensitive business information.
- SRS reference: §3.3 ("The backend shall never trust a tenant_id supplied directly by the frontend" / general isolation intent); §16.1 Security Requirements.
- Recommended fix: Document the tradeoff explicitly if keeping global email uniqueness; otherwise decouple login-identity uniqueness from per-tenant invite-conflict messaging.
- Test required: `POST /users` (invite) with an email known to belong to a user in a different tenant, as a non-platform-admin; assert the response does not disclose account existence beyond what's necessary.

#### [TEN-003] NotificationsService bypasses the tenant-scoping Prisma extension entirely
- Severity: P2
- Module: Multi-Tenancy
- File/path: `apps/api/src/notifications/notifications.service.ts` (all methods: `notify`, `listForUser`, `markRead`, `markAllRead`)
- Current behavior: `Notification` is explicitly listed in `TENANT_SCOPED_MODELS` (`apps/api/src/prisma/tenant-scoped-models.ts:46`), meaning the architecture's stated intent is for it to go through `prisma.db`. Instead, every method in `NotificationsService` uses `prisma.raw.notification.*`. `listForUser`/`markRead`/`markAllRead` filter by `userId` (sourced only from `@CurrentUser()` in the controller, never from client input — confirmed in `notifications.controller.ts`), so this is **not currently exploitable** as a cross-tenant read, but it is a live violation of the documented invariant ("`.raw` is reserved for platform-level code... Inject `PrismaService` and use `.db` for all normal application code").
- Expected behavior: Use `prisma.db.notification.*` so tenant scoping is enforced defense-in-depth, independent of whichever `userId` happens to be passed in.
- Why it matters: This is a latent IDOR risk, not a confirmed one — the moment anyone adds an admin-facing "view notifications for user X" endpoint (a very plausible near-term feature, e.g. for a Company Admin reviewing a specific employee's alerts) that takes `userId` from a route param instead of `@CurrentUser()`, this becomes a direct cross-tenant read with zero additional review needed to catch it, since it already compiles and passes today's tests.
- SRS reference: §3.3; §17.2 Database Design Rules ("never expose the database directly").
- Recommended fix: Switch all four methods to `prisma.db`. `tenantId` is already threaded through in `notify()`; the extension will add it automatically to `listForUser`/`markRead`/`markAllRead`'s `where` clauses once switched.
- Test required: Static/lint check that `NotificationsService` contains no `prisma.raw` references; a regression test asserting `markRead(userId, id)` 404s (not leaks) if `id` belongs to a notification for a different tenant's user with a colliding-looking id pattern.

#### [TEN-004] `.raw` escape-hatch used in several tenant-scoped services without structural protection against regression
- Severity: P3
- Module: Multi-Tenancy
- File/path: `apps/api/src/warehouses/warehouses.service.ts:61,64,69` (`Location`), `apps/api/src/payroll/payroll.service.ts:70` (`PayrollEntry`), `apps/api/src/roles/roles.service.ts:42-47` (`Permission`)
- Current behavior: Each of these calls operates on a child model that has no `tenantId` of its own (by the intentional D-014 pattern) and, in every case checked, is preceded in the same function by a `.db`-scoped lookup of the parent (`getById(factoryId, warehouseId)`, `getById(periodId)` → `employee.findUnique`, `getRoleById(id)`) that already 404s if the parent doesn't belong to the caller's tenant. **Today, all of these are safe** — confirmed by tracing each call site.
- Expected behavior: Because safety here depends entirely on "a verification call happens earlier in the same function and nobody reorders/removes it," this is fragile by construction. No test or lint currently enforces the ordering.
- Why it matters: A future edit (e.g. extracting `addLocation`'s body into a helper, or a well-intentioned refactor to "simplify" `payroll.service.ts` by inlining `getById`) could silently drop the verification step with no compiler or lint signal, reintroducing a cross-tenant leak identical in shape to the D-015 bug already found and fixed once in this project.
- SRS reference: §3.3; §22.
- Recommended fix: Prefer `.db` wherever the model can be reached through a relation filter (e.g. `prisma.db.location.findFirst({ where: { warehouseId, code: dto.code, warehouse: { tenantId: ctx.tenantId } } })` is unnecessary since `.db` doesn't auto-support relation-filter injection — but at minimum, add a code comment at each `.raw` call site explaining *why* it's safe (referencing the specific prior verification line), so a future edit is more likely to preserve it. Consider an eslint rule flagging `prisma.raw` usage outside `tenants/`, `auth/`, `roles/permission-backfill.service.ts`, and `audit/`.
- Test required: Integration test per call site that a warehouseId/periodId/roleId belonging to another tenant 404s before ever reaching the `.raw` call (regression guard for the ordering, not just the current behavior).

#### [TEN-005] Confirmed correct: Prisma extension rewrites `where` for read/update/delete, preventing IDOR-by-ID-guessing (not just cross-tenant LIST)
- Severity: N/A — verified control, documented for completeness per audit instructions
- Module: Multi-Tenancy
- File/path: `apps/api/src/prisma/prisma.service.ts:75-101` (`injectTenantId`), `apps/api/src/prisma/tenant-scoped-models.ts:53-67` (`WHERE_SCOPED_OPERATIONS`)
- Current behavior: `WHERE_SCOPED_OPERATIONS` includes `findFirst`, `findFirstOrThrow`, `findMany`, `findUnique`, `findUniqueOrThrow`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy` — i.e. every read/write operation, not just `create`. `injectTenantId` merges `tenantId` into `where` for all of them. This is the documented, Prisma-supported "row-level security via client extension" pattern: extra fields merged into a `findUnique` `where` at the extension layer bypass the generated client's TS-only uniqueness validation and reach the query engine as an additional filter, so `findUnique({ where: { id } })` on a tenant-scoped model reliably becomes `{ id, tenantId }` and returns `null` (→ 404 via each service's `NotFoundException`) for another tenant's record ID, rather than the record itself.
- Expected/why it matters: This directly answers the audit's highest-risk open question for Part A item 7 — cross-tenant **IDOR-by-guessing-an-ID is prevented**, not just cross-tenant LIST. Worth stating explicitly in the final report since getting this wrong would have been a P0.
- SRS reference: §22 ("Cross-tenant access is impossible").
- Recommended fix: None — confirmed correct. Recommend adding an explicit unit test asserting this behavior (see TENANT-ISOLATION-TEST-1) so it's guarded against regression, since it is currently only implicitly relied upon.
- Test required: See TENANT-ISOLATION-TEST-1.

#### [TEN-006] Confirmed correct: `TenantContextInterceptor` covers the full downstream chain, including all later interceptors
- Severity: N/A — verified control
- Module: Multi-Tenancy
- File/path: `apps/api/src/app.module.ts:89-103`, `apps/api/src/common/interceptors/tenant-context.interceptor.ts`
- Current behavior: Provider order is `ThrottlerGuard → JwtAuthGuard → PermissionsGuard` (guards, run pre-interceptor pipeline, read `request.user` directly, touch no Prisma) then `TenantContextInterceptor → ResponseInterceptor` (interceptors). `TenantContextInterceptor.intercept()` wraps `next.handle().subscribe(subscriber)` inside `TenantContextStore.run()`, and `next.handle()` at this point represents the rest of the interceptor chain (`ResponseInterceptor`) plus the controller method plus everything it `await`s. Because AsyncLocalStorage context follows the synchronous call stack and all `await`ed continuations from within `run()`'s callback, this genuinely covers 100% of the request's downstream execution, not just the controller entry point.
- Why it matters: Directly answers the audit's Part A item 2 question — there is no code path today where a controller/service Prisma call executes outside the established tenant context. (Background jobs/seed scripts are, by design, outside any HTTP request and must use `.raw` explicitly — that's the documented, intentional boundary, not a gap.)
- SRS reference: §3.3.
- Recommended fix: None — confirmed correct per D-015's fix. No new global interceptor should ever be registered ahead of `TenantContextInterceptor` in `app.module.ts`; worth a comment there warning future maintainers.
- Test required: None beyond existing coverage; note in traceability doc as verified.

---

### Explicit Tenant-Isolation Test Scenarios (Part A deliverable)

**TENANT-ISOLATION-TEST-1 — Cross-tenant IDOR-by-ID-guessing on a `findUnique`-style getById**
```gherkin
Given User A belongs to Tenant 1 and is authenticated with a valid access token
And Product P exists with id "prod_xyz" and belongs to Tenant 2
When User A calls GET /api/v1/products/prod_xyz
Then the response status must be 404
And the response body must not contain any field of Product P (name, SKU, GSM, etc.)
And the response must be indistinguishable from requesting a product ID that does not exist at all
```

**TENANT-ISOLATION-TEST-2 — Cross-tenant LIST does not leak rows via pagination/count**
```gherkin
Given Tenant 1 has 3 Customers and Tenant 2 has 5 Customers
And User A is authenticated as a Tenant 1 user with customer:view permission
When User A calls GET /api/v1/customers
Then the response's data array must contain exactly 3 items, all belonging to Tenant 1
And the response's pagination meta "total" must equal 3, not 8
```

**TENANT-ISOLATION-TEST-3 — Quality Dashboard "Top Defects" must not include other tenants' data (regression test for TEN-001)**
```gherkin
Given Tenant 1 has a QualityInspection with 2 Defects of type "STITCHING_LOOSE"
And Tenant 2 has a QualityInspection with 10 Defects of type "STITCHING_LOOSE"
And User A is authenticated as a Tenant 1 user with report:view permission
When User A calls GET /api/v1/dashboards/quality
Then the "topDefects" array entry for "STITCHING_LOOSE" must show count 2, not 12
```

**TENANT-ISOLATION-TEST-4 — Backend must never trust a client-supplied tenantId**
```gherkin
Given User A is authenticated as a Tenant 1 user
When User A calls POST /api/v1/products with body { "sku": "X", "name": "Y", "tenantId": "<Tenant 2's id>" }
Then the created Product must have tenantId = Tenant 1's id (the caller's own tenant from session), never Tenant 2's id
And no controller DTO in a non-platform module may accept or process a client-supplied "tenantId" field at all
```

**TENANT-ISOLATION-TEST-5 — Platform admin gets zero implicit bypass on tenant-scoped data**
```gherkin
Given a Platform Support Admin user (isPlatformAdmin = true, tenantId = null) is authenticated
When the Support Admin calls GET /api/v1/factories/:id for a factory belonging to Tenant 1 (an ordinary tenant route, not a /tenants/* platform route)
Then the response status must be 403 (no tenant context available for this user), not 200 with Tenant 1's data
And the same must hold for every tenant-scoped resource type (customers, sales orders, employees, etc.)
```

**TENANT-ISOLATION-TEST-6 — Unbatched raw SQL / escape-hatch operations remain tenant-scoped even when bypassing `.db`**
```gherkin
Given Tenant 1 and Tenant 2 each have a QualityInspection with Defects
And User A is authenticated as a Tenant 1 user
When User A calls any endpoint whose service reaches a model via `prisma.raw` (e.g. Location, PayrollEntry, Defect aggregation)
Then the returned/aggregated data must reflect only Tenant 1's records
And this must be verified by a direct unit test on the service method, not only by end-to-end behavior through a prior tenant-scoped lookup
```

**TENANT-ISOLATION-TEST-7 — Cross-tenant update/delete via a valid-looking child-resource ID**
```gherkin
Given Warehouse W1 belongs to Tenant 1, Factory F2 and Warehouse W2 belong to Tenant 2
And User A is authenticated as a Tenant 1 user with warehouse:create permission
When User A calls POST /api/v1/factories/:F2_id/warehouses/:W2_id/locations with a valid CreateLocationDto
Then the response status must be 404 (Warehouse not found), because :F2_id does not resolve under Tenant 1
And no Location row may be created under Tenant 2's Warehouse W2 as a side effect
```

---


---

## 9. RBAC Security Audit

*(Findings RBAC-001 through RBAC-005, from the dedicated Multi-Tenancy/RBAC/Auth Audit stream.)*

## PART B — RBAC Audit

#### [RBAC-001] Factory-level access (`UserFactoryAccess`) is computed but never enforced by any backend service
- Severity: P0
- Module: RBAC
- File/path: `apps/api/src/auth/strategies/jwt.strategy.ts:89` (computes `factoryIds`), `apps/api/src/common/tenant-context.ts:12` and `apps/api/src/common/interceptors/tenant-context.interceptor.ts:50` (carries `factoryIds` into the request context) — and, critically, its absence from `apps/api/src/machines/machines.service.ts`, `apps/api/src/employees/employees.service.ts`, `apps/api/src/warehouses/warehouses.service.ts`, and every other factory-scoped service.
- Current behavior: `JwtStrategy.validate()` correctly computes `factoryIds` from `UserFactoryAccess` rows and includes it in `AuthenticatedUser`, which `TenantContextInterceptor` correctly copies into `TenantContextStore`, and `GET /auth/session` correctly returns it to the frontend. A grep for `factoryIds` across the entire `apps/api/src` tree shows it is referenced **only** in: the type definitions, the interceptor that copies it into context, and `UsersService` (which validates factory IDs exist when *assigning* access to a user). It is never read by `MachinesService`, `EmployeesService`, `WarehousesService`, `ProductionService`, `AttendanceService`, `DowntimeService`, or any other service whose resources hang off a `factoryId`. Every `list`/`getById`/`create`/`update` in those services filters only by tenant (via `.db`) and by whatever `factoryId` the caller passes as a route/query param — with no check that the caller's `factoryIds` includes it.
- Expected behavior: A user whose `UserFactoryAccess` is limited to Factory 01 should receive 403/empty-results for any factory-scoped resource belonging to Factory 02 of the same tenant, per SRS §16.1's explicit verification chain: "User → Tenant → Factory → Role → Permission → Resource."
- Why it matters: This is a complete, silent bypass of factory-level access control. A Machine Operator or Production Supervisor granted access to only one factory (the common real-world case per SRS §5.3 — "a company may operate multiple factories") can currently view and modify machines, employees, warehouses, and (by the identical missing-check pattern) production/attendance/downtime records belonging to **every other factory in their own tenant**, not just their assigned one. Given the product's stated use case (multi-factory groups), this defeats a core access-control expectation the UI/session payload actively advertises as enforced.
- SRS reference: §5.3 Factory Management; §4.1/§16.1 ("User → Tenant → Factory → Role → Permission → Resource" verification chain, explicitly naming Factory as a mandatory check).
- Recommended fix: Add a `factoryId`-membership check (mirroring the existing tenant-check pattern) to every factory-scoped service — either a shared guard/decorator (`@RequireFactoryAccess()` reading `params.factoryId` against `ctx.factoryIds`) or an explicit `if (ctx.factoryIds.length && !ctx.factoryIds.includes(factoryId)) throw new ForbiddenException()` at the top of each `create`/`list`/`getById`/`update`. Treat an empty `factoryIds` array as "all factories" (current behavior for Company Owner/Admin, who typically have no `UserFactoryAccess` rows and should retain full access) vs. a non-empty array as an explicit allowlist.
- Test required: See RBAC-TEST-1 below (new; not in Part A's tenant-isolation list since this is a factory-, not tenant-, boundary).

```gherkin
Scenario: RBAC-TEST-1 — Factory-scoped user cannot access another factory's machine
  Given User B belongs to Tenant 1 with UserFactoryAccess limited to Factory 01 only
  And Machine M exists in Tenant 1's Factory 02
  When User B calls GET /api/v1/machines/machines/:M.id
  Then the response status must be 403 or 404, not 200 with Machine M's data
  And the same must hold for POST/PATCH on Employees, Warehouses, and Production Orders scoped to Factory 02
```

#### [RBAC-002] `Export` and `Print` actions are modeled and default-granted but never enforced anywhere
- Severity: P1
- Module: RBAC
- File/path: `apps/api/src/common/rbac.constants.ts:47-56` (`Action` enum includes `EXPORT`, `PRINT`), and every `*.controller.ts` (grepped for `Action.EXPORT`/`Action.PRINT` in `@RequirePermission` — zero matches across the entire codebase).
- Current behavior: `EXPORT` and `PRINT` are two of the 8 actions SRS §4.2 requires, and `DEFAULT_ROLE_PERMISSIONS` grants both to nearly every role (via the `VIEW_ONLY`/`STANDARD`/`STANDARD_WITH_DELETE`/`APPROVAL` constants, all of which include `Action.EXPORT, Action.PRINT`). But no controller anywhere calls `@RequirePermission(<resource>, Action.EXPORT)` or `Action.PRINT` — there are no distinct export/print HTTP endpoints at all. `View`/`Create`/`Update`/`Delete`/`Approve`/`Reject` are the only 6 of the 8 actions with real enforcement points.
- Expected behavior: If Export/Print are meant to be independently grantable/revocable (as SRS §4.2 and the `UserPermissionOverride` model imply — an admin should be able to DENY a specific user's `product:EXPORT` while leaving `product:VIEW` intact), there must be an endpoint or a code path that actually checks that specific permission before allowing a CSV/PDF export or print action.
- Why it matters: Today, denying a user's EXPORT permission via a per-user override has zero effect — they can still see (and, via browser/API tooling, extract) the exact same data through the ordinary `VIEW`-gated list/detail endpoints, since no separate control point exists. This makes 2 of the 16 role × 8 action combinations in the SRS's permission model purely cosmetic.
- SRS reference: §4.2 Permission Model (explicitly lists Export, Print as assignable actions).
- Recommended fix: Either implement real export/print endpoints (e.g. `GET /api/v1/products?format=csv` or a dedicated `/export` route) gated by `@RequirePermission(Resource.PRODUCT, Action.EXPORT)`, or, if export/print are entirely a frontend concern with no distinct backend data shape, explicitly document that these two actions are advisory/UI-only and out of scope for backend enforcement in the MVP — but that should be a stated decision, not a silent gap.
- Test required: For at least one resource (Products), add an export endpoint and a test asserting a user with `product:VIEW` but `product:EXPORT` explicitly denied gets 403 on it while still succeeding on the plain list endpoint.

#### [RBAC-003] Frontend has no factory-level gating, consistent with (and masking) the backend gap
- Severity: P3
- Module: RBAC
- File/path: `apps/web/src/store/auth-store.ts`, `apps/web/src/components/shared/permission-gate.tsx`, `apps/web/src/components/layout/sidebar.tsx`
- Current behavior: `useAuthStore().can(resource, action)` and `<PermissionGate>` correctly mirror the backend's `resource:action` model (confirmed: `can()` checks `allow`/`deny` sets identical in shape to `PermissionsGuard`, and platform admins get no bypass on tenant-resource permission checks — matching D-015's fix). However, `factoryIds` (present in the session payload returned by `GET /auth/session`) is never read by any frontend gating logic — it's only used to populate the multi-select checkboxes in the user-invite/edit form. No list/detail page filters or restricts by the current user's `factoryIds`.
- Expected behavior: Once RBAC-001 is fixed server-side, the frontend should also filter factory-scoped pickers/lists to the user's accessible factories, both for UX (don't show a Factory-02-only operator a Factory-01 machine list they can't act on) and defense-in-depth.
- Why it matters: Purely a UI-consistency gap today since the backend doesn't enforce this either (RBAC-001); becomes actionable once that's fixed.
- SRS reference: §5.3.
- Recommended fix: Add factory-scoping to relevant list/detail queries and to `PermissionGate`/`can()` once the backend check (RBAC-001) exists.
- Test required: Playwright test — a Factory-01-only user does not see Factory-02 machines/employees in list views.

#### [RBAC-004] Confirmed correct: Company Owner role-edit lock is enforced server-side, not just in the UI
- Severity: N/A — verified control
- Module: RBAC
- File/path: `apps/api/src/roles/roles.service.ts:38-40` (`setRolePermissions`)
- Current behavior: `if (role.code === 'COMPANY_OWNER') throw new NotFoundException('The Company Owner role cannot be modified')` — this check is in the service layer, reached via `PUT /roles/:id/permissions`, independent of whatever the frontend's Roles matrix UI does or doesn't disable.
- Why it matters: Directly answers Part B item 5 — confirmed this is not a UI-only control that a direct API call could bypass.
- SRS reference: §4.1/§4.2.
- Recommended fix: None — confirmed correct.
- Test required: `PUT /roles/:companyOwnerRoleId/permissions` as Company Admin → expect 404, regardless of frontend state.

#### [RBAC-005] Every mutating endpoint reviewed has a `@RequirePermission` decorator, with two deliberate and justified exceptions
- Severity: N/A — verified control
- Module: RBAC
- File/path: All `*.controller.ts` under `apps/api/src/*` (grepped and manually cross-checked against every `@Post`/`@Patch`/`@Put`/`@Delete`).
- Current behavior: Every mutating tenant-resource endpoint carries a `@RequirePermission(Resource.X, Action.Y)`. The only mutating endpoints without one are: (a) `TenantsController`'s platform routes (`POST /tenants`, `PATCH /tenants/:id/status`), which instead carry `@UseGuards(PlatformAdminGuard)` at the method level — a stricter, correctly-scoped control, not a gap; and (b) `NotificationsController`'s `PATCH :id/read` / `PATCH read-all`, which are explicitly documented as "every authenticated user manages only their own notifications — no resource permission needed" and are safe because they're scoped by `@CurrentUser().userId`, never a client-supplied ID.
- Why it matters: Directly answers Part B item 2 — no "authenticated-but-not-authorized" endpoint was found among the mutating routes reviewed.
- SRS reference: §17.7 API Standards ("Implement authorization and tenant checks on every endpoint").
- Recommended fix: None for the cases reviewed. Worth a standing lint rule (e.g. a custom ESLint rule requiring `@RequirePermission` or an explicit `@UseGuards`/documented-exception comment on every `@Post`/`@Patch`/`@Put`/`@Delete` handler) so this stays true as new modules are added, given the project's own pattern of shipping large module batches at once.
- Test required: A generic e2e sweep — for every mutating route, assert a freshly-authenticated user with zero permissions gets 403, not 201/200.

---


---

## 10. Inventory Integrity Audit

*(Full findings from the dedicated Inventory Integrity Audit stream.)*

> **Editorial reconciliation note (added during synthesis):** INV-007 below assesses the concurrent-first-write race on `Stock` as P2, reasoning that the `@@unique` constraint would cause the losing transaction to fail with a Prisma `P2002` error rather than silently duplicate. The independent Database/Prisma audit stream (§7, finding **DB-002**) re-examined the same race and established that this is only true when every column in the composite unique key (`warehouseId, locationId, productId, materialId, batchNumber`) is non-null on both sides. Standard PostgreSQL unique-constraint semantics treat `NULL <> NULL`, so whenever `locationId` and/or `batchNumber` are null — confirmed to be the common case for unbatched, unlocated stock — two concurrent first-writes for the same item **do not conflict at the database level at all**, and both inserts succeed, producing a genuine silently-duplicated `Stock` balance row rather than a thrown error. **This synthesis adopts DB-002s P0 severity as the correct, reconciled assessment** for this race condition; INV-007s narrower P2 framing describes only the less-common fully-keyed case. Both are kept below as originally written for traceability, but the master severity lists (§18) count this once, as DB-002, at P0.

## Section 10 — Inventory Integrity Audit

Scope: `apps/api/src/inventory/`, plus every direct `prisma.db.stock`/`prisma.db.stockMovement` touchpoint across `apps/api/src`, cross-checked against `prisma/schema.prisma`, SRS §8 (Inventory & Logistics), and DEVELOPMENT_LOG.md's D-023 bug writeup.

---

### Top-line verdicts

#### The 5 traced flows

| Flow | Verdict | Evidence |
|---|---|---|
| Procurement Goods Receipt (stock IN) | **PASS** | `apps/api/src/procurement/procurement.service.ts:231-241` — calls `inventoryService.recordMovement(..., type: 'RECEIVE', ...)` per accepted item, never touches `Stock`/`StockMovement` directly. |
| Production material consumption (stock OUT, raw material) | **PASS** | `apps/api/src/production/production.service.ts:266-274` — calls `inventoryService.recordMovement(..., type: 'CONSUMPTION', quantity: -Math.abs(...))`. |
| Production batch output (stock IN, finished/WIP) | **PARTIAL** | `apps/api/src/production/production.service.ts:225-236` — calls `recordMovement(..., type: 'PRODUCTION_RECEIPT', ...)` correctly **only when `dto.outputWarehouseId` is supplied**; that field is optional (`apps/api/src/production/dto/production-batch.dto.ts:22`), so a batch can be marked `COMPLETED` with real `outputQuantity` and never enter stock at all. See INV-004. |
| Dispatch (stock OUT, finished goods vs. Sales Order) | **PASS** | `apps/api/src/dispatch/dispatch.service.ts:59-68` — calls `recordMovement(..., type: 'ISSUE', quantity: -Math.abs(...))` per line item, never writes `Stock`/`StockMovement` directly. |
| `InventoryService.transferStock()` atomicity | **VIOLATION** | `apps/api/src/inventory/inventory.service.ts:106-143` — the source-decrement and destination-increment are two **separate** `await this.recordMovement(...)` calls, each opening and committing its own independent `prisma.db.$transaction`. Not wrapped in one outer transaction. See INV-001. |

#### The 7 SRS §8.1 inventory operations

| Operation | Verdict | Evidence |
|---|---|---|
| Stock Receive | **PASS** | `ManualMovementType.RECEIVE` via `POST /inventory/movements` (`inventory.controller.ts:26-47`); also automatic from Goods Receipt. |
| Stock Issue | **PASS** | `ManualMovementType.ISSUE` via `POST /inventory/movements`; also automatic from Dispatch. |
| Stock Transfer | **PASS** (exists) / **PARTIAL** (not atomic — see INV-001) | `POST /inventory/transfer` → `transferStock()`, `inventory.controller.ts:49-53`. |
| Stock Adjustment | **PASS** | `ManualMovementType.ADJUSTMENT` with `decrease` flag, `inventory.controller.ts:29-34`. |
| Stock Return | **PASS** | `ManualMovementType.RETURN` via `POST /inventory/movements`. Only reachable as a generic manual movement — no dedicated Sales-Return or Supplier-Return workflow calls into it, so it exists as a capability but isn't wired into any higher-level return process. |
| Material Consumption | **PASS** | `StockMovementType.CONSUMPTION`, driven from Production (`production.service.ts:266-274`), not manually exposed on the Inventory controller — matches the documented design that CONSUMPTION/RECEIVE/PRODUCTION_RECEIPT "normally come from Procurement/Production instead" (`record-movement.dto.ts:3`). |
| Production Receipt | **PASS** (capability exists) / **PARTIAL** in practice — see INV-004 | `StockMovementType.PRODUCTION_RECEIPT`, driven from `recordBatchOutput()`. |

---

### Is `InventoryService` genuinely the single source of truth for stock?

**Yes, with caveats.** Every direct Prisma access to the `Stock` and `StockMovement` models outside `apps/api/src/inventory/` was found and is read-only:

- `apps/api/src/dashboards/dashboards.service.ts:46,114,115,120` — `stock.findMany`, `stock.aggregate`, `stockMovement.count`, all for dashboard KPIs. No writes.

No other file in `apps/api/src` (Procurement, Production, Dispatch, Sales, Quality, Maintenance, etc.) calls `.stock.create/update/upsert/delete` or `.stockMovement.create/update/delete` directly — every mutation path goes through `InventoryService.recordMovement()` / `transferStock()`. This confirms D-023's architecture note is currently accurate: no writer bypasses the ledger.

The caveats are not about *who* writes to stock, but about correctness *inside* `InventoryService` itself and gaps in *when* callers invoke it (batch output's optional warehouse, §INV-004) — covered below.

---

### Detailed findings

#### INV-001 `transferStock()` is not atomic — a transfer can partially fail
- Severity: P1
- Module: Inventory
- File/path: `apps/api/src/inventory/inventory.service.ts:106-143`
- Current behavior: `transferStock()` issues two independent `await this.recordMovement(...)` calls — one for the source (negative quantity) and one for the destination (positive quantity). Each call opens and commits its **own** `prisma.db.$transaction`. If the first call commits and the second throws (DB blip, connection drop, an unrelated constraint issue at the destination row), the source warehouse has already been permanently decremented and the destination never receives the stock — it is silently lost from the system, with only a `StockMovement` row for the source leg recorded (an unbalanced ledger).
- Expected behavior: Per the task's own framing and standard inventory-system practice, a transfer between two locations must be atomic — both legs commit or neither does.
- Why it matters: This is exactly the "stock shall never be changed silently" class of bug SRS §8.3 exists to prevent, applied to the one operation (`transferStock`) that is documented as being deliberately built to keep the ledger from drifting.
- SRS reference: §8.1 (Stock Transfer), §8.3 ("stock shall never be changed silently... unbroken audit trail")
- Recommended fix: Extract the shared movement-writing logic from `recordMovement()` into a private helper that accepts an existing `tx` (Prisma transaction client), and have `transferStock()` open a single `prisma.db.$transaction` that calls the helper twice with the same `tx`.
- Test required: Simulate a failure injected between the two legs (e.g. mock the second `stockMovement.create` to throw) and assert the source leg is rolled back too (no orphaned decrement, no unbalanced `StockMovement` rows).

#### INV-002 No negative-stock validation, at either the application or database level
- Severity: P1
- Module: Inventory
- File/path: `apps/api/src/inventory/inventory.service.ts:37-103` (`recordMovement`); `prisma/schema.prisma:1173-1196` (`Stock` model); `prisma/migrations/20260911200241_init/migration.sql:729-742`
- Current behavior: `recordMovement()` applies `quantity: { increment: input.quantity }` (or creates a fresh row) unconditionally — there is no check anywhere that the resulting balance is `>= 0` before an OUT-type movement (ISSUE/CONSUMPTION/negative ADJUSTMENT/negative TRANSFER leg) is applied. The `Stock.quantity` column has no `CHECK` constraint in the schema or the generated migration SQL, and no application-level guard exists in `InventoryService`, `DispatchService`, or `ProductionService`.
- Expected behavior: An OUT movement that would drive a `Stock` row's quantity below zero should be rejected (or at minimum flagged), either via an application-level pre-check inside the same transaction (`SELECT` current quantity, verify sufficient before `UPDATE`) or a DB `CHECK (quantity >= 0)` constraint as a hard backstop.
- Why it matters: Dispatch, material consumption, and manual ISSUE/ADJUSTMENT can currently push any `Stock` row arbitrarily negative with no error, no warning, and no audit flag — masking real stock-accuracy problems (e.g. dispatching more than is physically on hand) that the SRS's whole "inventory accuracy" objective (§2.2) and MVP acceptance criterion ("Inventory updates automatically from production and dispatch," §22) depend on being caught, not silently tolerated.
- SRS reference: §2.2 ("Reduce material wastage and improve inventory accuracy"), §8.3
- Recommended fix: Add an application-level check inside `recordMovement()`'s transaction — for any movement with `quantity < 0`, read the existing row's current quantity and reject (e.g. `BadRequestException`) if `current + input.quantity < 0`, unless the caller explicitly opts into an "allow negative" override for adjustment/correction cases. As a defense-in-depth backstop, add a raw-SQL `CHECK` constraint on `stock.quantity >= 0` via a migration.
- Test required: Attempt to ISSUE/CONSUME more than the current `Stock.quantity` for an item and assert the request is rejected and the `Stock` row is unchanged; attempt the same against a nonexistent `Stock` row (no prior RECEIVE at all) and assert no phantom negative row is created.

#### INV-003 "Oldest first" unbatched matching is not true FIFO — `Stock` has no creation timestamp, only `updatedAt`
- Severity: P2
- Module: Inventory
- File/path: `apps/api/src/inventory/inventory.service.ts:61-79`; `prisma/schema.prisma:1173-1196`
- Current behavior: When no `batchNumber` is given, `recordMovement()` matches "any existing row for this item... oldest first" via `orderBy: { updatedAt: 'asc' }` (line 79). But the `Stock` model has no `createdAt` field — only `updatedAt` (`@updatedAt`, bumped on **every** quantity change to that row, including unrelated RECEIVE/ADJUSTMENT/TRANSFER activity). So "oldest first" actually means "the row least recently touched by *any* movement," not "the row whose batch was received first." A batch received earlier but subsequently adjusted/topped-up will sort *after* a genuinely newer batch that hasn't been touched since receipt — inverting the intended draw-down order.
- Expected behavior: True FIFO (or an explicitly chosen FEFO/costing-aware policy) requires ordering by when the batch/lot was first created, not by last-write recency. Since batches are date-coded in most textile FIFO workflows and SRS §7.4 tracks `Batch Number`/traceability, the natural fix is a stable `createdAt` on `Stock` (or deriving oldest-batch order from `StockMovement.createdAt` of the original RECEIVE/PRODUCTION_RECEIPT for that batch).
- Why it matters: For a textile factory, drawing down the wrong batch first breaks batch-level costing (§11, "cost per batch") and traceability promises (§8.3, §9.2's "Material Batch" link in the quality-traceability chain) even though the total quantity math stays correct — the *which batch* answer becomes wrong silently.
- SRS reference: §7.4 (batch traceability), §8.2/§8.3 (batch-level stock tracking, unbroken audit trail), §9.2 (quality traceability through Material Batch)
- Recommended fix: Add `createdAt DateTime @default(now())` to the `Stock` model and order the unbatched match by `createdAt: 'asc'` instead of `updatedAt: 'asc'`. Confirm with product/factory stakeholders whether FIFO (current stated intent) or FEFO (expiry-driven) is actually correct for each material class before finalizing.
- Test required: Create two batches for the same item at different times, apply an unrelated ADJUSTMENT to the older batch's row (bumping its `updatedAt` past the newer batch's), then perform an unbatched ISSUE and assert it still draws from the chronologically older batch.

#### INV-004 Production batch output can be marked COMPLETED with real output quantity while never updating stock
- Severity: P1
- Module: Inventory / Production
- File/path: `apps/api/src/production/production.service.ts:210-240`; `apps/api/src/production/dto/production-batch.dto.ts:16-23`
- Current behavior: `recordBatchOutput()` only calls `inventoryService.recordMovement(..., type: 'PRODUCTION_RECEIPT', ...)` `if (dto.outputWarehouseId && dto.outputQuantity > 0)`. `outputWarehouseId` is `@IsOptional()` on `RecordBatchOutputDto`. If it is omitted, the batch is still updated to `status: 'COMPLETED'` with a real `outputQuantity`, `wastage`, `rework`, `rejection` — but no `StockMovement`/`Stock` change happens at all. DEVELOPMENT_LOG.md documents the frontend form for this as having "optional receiving warehouse," so this is a reachable, expected UI path, not a theoretical edge case.
- Expected behavior: Recording a batch's output with `outputQuantity > 0` should either require a receiving warehouse (make it mandatory) or, if intentionally deferred, clearly track that the batch's output is "pending receipt into inventory" rather than silently completing with no inventory trace.
- Why it matters: SRS §22's MVP acceptance criteria explicitly requires "Inventory updates automatically from production... " — this flow can complete a production batch that produced real finished/WIP goods with zero corresponding stock movement, which is precisely the kind of "silently changed" (or in this case, silently *not* changed) stock state §8.3 is meant to prevent. It also means dashboards/inventory valuation (§12.4) can under-report finished-goods stock with no error surfaced anywhere.
- SRS reference: §22 (MVP acceptance: "Inventory updates automatically from production and dispatch"), §8.3
- Recommended fix: Make `outputWarehouseId` required on `RecordBatchOutputDto` whenever `outputQuantity > 0`, or default it to the production order's factory's configured WIP/Finished-Goods warehouse. At minimum, raise a validation error rather than silently skipping the stock movement.
- Test required: Call `recordBatchOutput` with `outputQuantity > 0` and no `outputWarehouseId`; assert either a validation error or an automatic movement, not silent completion with zero inventory effect.

#### INV-005 Goods Receipt processes items in a loop outside a single transaction — partial failure can desync PO-received quantities from actual stock
- Severity: P2
- Module: Inventory / Procurement
- File/path: `apps/api/src/procurement/procurement.service.ts:220-242`
- Current behavior: `createGoodsReceipt()` creates the `GoodsReceipt` record (with all items) up front, then loops over `dto.items`, for each one first incrementing `PurchaseOrderItem.receivedQty`/`rejectedQty` (its own auto-committed statement) and *then* calling `inventoryService.recordMovement()` (its own separate `$transaction`) if `acceptedQty > 0`. None of this — the `GoodsReceipt` create, the per-item `PurchaseOrderItem` updates, and the per-item `recordMovement` calls — is wrapped in one outer transaction.
- Expected behavior: If an item mid-loop fails (e.g. `recordMovement` throws for item 2 of 3), the already-committed `GoodsReceipt`/`PurchaseOrderItem` state and already-completed stock movements for items 1 will remain, while item 2's `receivedQty` was incremented but its stock movement was never recorded — and item 3 never runs at all. The system is left with a `GoodsReceipt` that claims all items were received/accepted, a `PurchaseOrderItem.receivedQty` that reflects item 2 as received, but no matching `Stock`/`StockMovement` row for item 2.
- Why it matters: This is a narrower version of the same "ledger can drift from the rest of the system" risk INV-001 covers for transfers — an unbroken audit trail (§8.3) requires that a `GoodsReceipt`'s recorded quantities and the actual stock ledger never disagree, which a partial failure here can violate.
- SRS reference: §6.2 (procurement workflow), §8.3
- Recommended fix: Wrap the `GoodsReceipt` creation, all `PurchaseOrderItem` updates, and all per-item stock movements in a single `prisma.db.$transaction`, using the same `tx`-accepting helper recommended for INV-001.
- Test required: Inject a failure on the second item's `recordMovement` call and assert the whole goods receipt (including the first item's already-processed state) rolls back rather than partially committing.

#### INV-006 `StockMovement` carries no running/point-in-time balance — historical stock-as-of-date requires replaying the full ledger
- Severity: P3
- Module: Inventory
- File/path: `prisma/schema.prisma:1210-1239` (`StockMovement` model)
- Current behavior: `StockMovement` records only the movement's own `quantity` (the delta), not a `balanceAfter`/`balanceBefore` snapshot. The only "current balance" is `Stock.quantity`, which is overwritten in place on every movement (no history of what it was at any earlier point). Reconstructing "what was the stock level for item X in warehouse Y on date Z" requires summing every `StockMovement` for that (warehouse, location, product/material, batch) combination up to that date — with no indexed support for that exact combination (the compound key isn't itself indexed on `StockMovement`, only `[tenantId, productId]` / `[tenantId, materialId]` / `[tenantId, referenceType, referenceId]`).
- Expected behavior: For audit/traceability purposes this is functionally acceptable (nothing is lost — the ledger is append-only and correct), but it does not satisfy "point-in-time balance" reporting without an expensive replay, and there is no indexed path to replay a *specific* warehouse+location+product+batch combination's history efficiently at scale (§16.3 targets "millions of transactions").
- Why it matters: Not a correctness bug today, but a reporting/scalability gap: inventory valuation-as-of-date, audit reconstruction, and dispute investigation ("what was the stock on the day of the complaint") all require full-ledger replay rather than an O(1) lookup.
- SRS reference: §8.3 (unbroken audit trail), §16.2/§16.3 (performance/scalability — indexed queries, large datasets)
- Recommended fix: Either add a `balanceAfter` snapshot column populated inside the same transaction that appends the movement, or add a composite index on `StockMovement (tenantId, warehouseId, locationId, productId, materialId, batchNumber, createdAt)` to make replay queries efficient if snapshotting is deliberately avoided.
- Test required: Not urgent enough to require a regression test before other P1/P2 items; if fixed, add a test asserting `balanceAfter` matches the corresponding `Stock.quantity` immediately after each movement in a sequence.

#### INV-007 Concurrent first-time stock creation for the same (warehouse, location, product/material, batch) key can throw rather than merge
- Severity: P2
- Module: Inventory
- File/path: `apps/api/src/inventory/inventory.service.ts:77-99`; `prisma/schema.prisma:1193` (`@@unique([warehouseId, locationId, productId, materialId, batchNumber])`)
- Current behavior: The quantity math itself is race-safe: `recordMovement()` matches an existing row and applies `{ increment: input.quantity }`, which Postgres executes as an atomic `UPDATE ... SET quantity = quantity + $delta` — even without an explicit row lock, concurrent updates to the *same existing row* serialize correctly and no update is lost (this is a genuine positive — the task's suspected lost-update race on quantity does **not** occur for existing rows). However, when **no** `Stock` row yet exists for a given key, two concurrent `recordMovement()` calls (e.g. simultaneous first-ever RECEIVE and PRODUCTION_RECEIPT racing at exact the same instant for the same never-before-seen batch) can both `findFirst` under READ COMMITTED, both see `null`, and both attempt `tx.stock.create(...)`. The `@@unique` constraint on `Stock` prevents silent duplication, but the second transaction fails with a Prisma `P2002` unique-constraint violation and its entire `$transaction` — including the already-written `StockMovement` audit row — rolls back, surfacing as an unhandled 500 to the caller.
- Expected behavior: A genuinely concurrent first-time RECEIVE/PRODUCTION_RECEIPT for the same key should either serialize cleanly (one waits, then increments) or fail with a clear, retryable error — not an opaque 500.
- Why it matters: Low-frequency (only matters on the very first movement for a given item/batch/location combination) but real; at MVP scale (§16.3 targets 100+ tenants, thousands of users) simultaneous first-receipt races are plausible during, e.g., two warehouse clerks receiving the same newly arrived batch at once.
- SRS reference: §16.2/§16.3 (scalability, correctness under concurrent load), §8.3
- Recommended fix: Catch the `P2002` unique-violation inside `recordMovement()` and retry the find+increment path once (the row now exists because the racing transaction committed first), rather than letting the raw Prisma error surface.
- Test required: Fire two concurrent `recordMovement()` calls with identical warehouse/product/batch keys and no pre-existing `Stock` row; assert both eventually succeed with the correct summed quantity and no unhandled 500.

#### INV-008 `Location` granularity does not carry Rack/Bin as first-class, independently trackable dimensions
- Severity: P3
- Module: Inventory
- File/path: `prisma/schema.prisma:414-432` (`Location` model)
- Current behavior: SRS §8.2 states stock shall be tracked at "Warehouse → Location → Rack → Bin granularity." The schema implements `Location` with `rack` and `bin` as plain optional `String` fields on a single `Location` row (not as their own normalized levels), and `Stock`/`StockMovement` reference only `locationId`. This works functionally — a distinct rack/bin combination must be modeled as its own `Location` row (its `rack`/`bin` text fields describing where that Location physically sits) — but there is no way to query/report "all stock in Rack 3" across multiple bins, or "all bins in Rack 3," without a string match on `Location.rack`, since there's no `Rack` entity to join through.
- Expected behavior: If rack- and bin-level reporting/rollups are actually required (not just storage-level tracking), `Rack` and `Bin` would need to be their own hierarchy levels under `Warehouse`, or at minimum indexed fields on `Location` (`rack`, `bin` are not indexed).
- Why it matters: Functionally sufficient for tracking *where* a given quantity of stock sits, but weaker than the SRS's literal 4-level hierarchy for rack/bin-level operational reporting (e.g. "which racks are near capacity").
- SRS reference: §8.2
- Recommended fix: If rack/bin-level rollup reporting is in scope for MVP, add an index on `Location(warehouseId, rack)`/`Location(warehouseId, rack, bin)`; if not, no change needed — this is closer to a documentation/expectation gap than a functional defect, since the granularity is still fully trackable through `Location`.
- Test required: Only needed if rack/bin rollup reporting is added as a requirement; not blocking.

#### INV-009 D-023 re-verification: fix is real and correctly scoped, one residual gap
- Severity: P3 (informational / residual gap only — the core fix is confirmed correct)
- Module: Inventory
- File/path: `apps/api/src/inventory/inventory.service.ts:61-79`
- Current behavior: Re-read line by line. The claimed fix is present and correct as described: when `input.batchNumber` is provided, the match is exact (`{ ...baseStockWhere, batchNumber: input.batchNumber }`); when it is omitted, the match is `baseStockWhere` alone (no `batchNumber` filter at all), ordered `updatedAt: asc`, taking the first result — i.e. "any existing row for this item, oldest-first" exactly as documented. The original bug (unbatched match requiring `batchNumber: null` and thus missing a named-batch row, creating a phantom offsetting row) is confirmed fixed: an unbatched request now finds and draws down a named-batch row if that's the only one that exists.
- Residual gap: If genuinely **no** `Stock` row exists at all for the item (never received under any batch) and an unbatched OUT movement is attempted, `existingStock` is `null` and the code falls through to `tx.stock.create()` with the **negative** `input.quantity` — recreating a milder version of the original D-023 symptom (a stock row born negative) for the case where the item was never received in the first place. This is the same root issue as INV-002 (no negative-stock guard), just noting the direct connection to D-023's original bug class.
- Why it matters: Confirms the log's claimed fix for the *reported* repro is genuinely fixed and correctly verified, but the underlying missing guard (no negative-stock validation) that made the original bug possible has not been closed — only the specific batch-matching trigger for it has.
- SRS reference: §8.3
- Recommended fix: Covered by INV-002's fix (negative-stock guard) — once that lands, this residual path is also closed.
- Test required: Covered by INV-002's test plan (issuing/consuming an item with zero prior stock history should be rejected, not silently create a negative row).

---

### Summary of findings by severity

- P0: 0
- P1: 3 (INV-001, INV-002, INV-004)
- P2: 4 (INV-003, INV-005, INV-007, and INV-008 is actually P3 — see below)
- P3: 3 (INV-006, INV-008, INV-009)

(Recount for clarity: P1 = INV-001, INV-002, INV-004. P2 = INV-003, INV-005, INV-007. P3 = INV-006, INV-008, INV-009. Total = 9 findings.)

---

## 11. Business Workflow Audit

*(Full findings from the dedicated Business Workflow Audit stream, covering all 7 core lifecycles.)*

> **Editorial arithmetic correction (added during synthesis):** the source reports totals line reads "1 P0, 9 P1, 4 P2, 3 P3 — 19 findings." Recounting the severity column of its own findings table directly gives **1 P0, 11 P1, 4 P2, 3 P3 — 19 findings** (WF-001, 002, 004, 005, 006, 007, 008, 012, 013, 017, 018 are all marked P1 = 11 items, not 9). The master severity lists (§18-§21) use the corrected count of 11 P1.

## Section 11 — Business Workflow Audit

Scope: precise, code-verified characterization of state-machine enforcement (or lack
thereof) across the seven core AbyteTex business workflows, benchmarked against SRS
§6, §7, §8.4, and §9. Every claim below is based on reading the actual service,
controller, DTO, and Prisma schema files listed per section — not on
DEVELOPMENT_LOG.md's self-report alone (D-022 is verified, not assumed, in each
section).

**Files read for this audit:**
`prisma/schema.prisma` (all workflow-relevant enums/models),
`apps/api/src/sales/{sales.service.ts,sales.controller.ts,dto/*}`,
`apps/api/src/procurement/{procurement.service.ts,procurement.controller.ts,dto/*}`,
`apps/api/src/production/{production.service.ts,production.controller.ts,dto/*}`,
`apps/api/src/dispatch/{dispatch.service.ts,dispatch.controller.ts,dto/*}`,
`apps/api/src/quality/{quality.service.ts,quality.controller.ts,dto/*}`,
`apps/api/src/maintenance/{maintenance.service.ts,maintenance.controller.ts,dto/*}`,
`apps/api/src/downtime/{downtime.service.ts,dto/*}`,
`apps/api/src/audit/audit.service.ts`,
`apps/api/src/common/rbac.constants.ts`.

**Top-line verdict on D-022:** The claim ("Sales/Purchase/Production order status
changes are accepted for any value in the enum with no state-machine enforcement
yet") **holds true, and is in fact broader than logged** — the same "any enum value,
no guard" pattern also applies to Production **Batch** status
(`updateBatchStatus`), and Maintenance Job status (`update`). Two workflows have no
free-form status problem only because they have **no status-transition endpoint at
all**: Dispatch (status is hardcoded to `DISPATCHED` at creation; `PLANNED`/`PACKED`/
`DELIVERED`/`CANCELLED` are unreachable dead enum values) and Goods Receipt (status
is fully computed at creation from item quantities; there is no follow-up
"Quality Check" step, contradicting the SRS's explicit Goods Receipt → Quality
Check → Inventory ordering — inventory posts as part of receipt creation itself).
Quality inspection outcomes (Pass/Rework/Hold/Reject) have exactly one enforcement
side effect (batch → `HOLD`) and it is **not durable**: a later `recordBatchOutput`
call unconditionally overwrites `status` back to `COMPLETED`, silently erasing the
Hold. No workflow's status transitions are blocked by a switch/guard/validator of
any kind; every `IsIn(ENUM_VALUES)` DTO validator accepts every enum value with no
regard to the record's current state.

---

### 1. Sales Order Lifecycle

**States** (`SalesOrderStatus`, `prisma/schema.prisma:668`):
`DRAFT, CONFIRMED, PRODUCTION_PLANNED, IN_PRODUCTION, QUALITY, READY, DISPATCHED, COMPLETED, CANCELLED`

**SRS-required flow** (§6.1): `Draft → Confirmed → Production Planned → In Production → Quality → Ready → Dispatched → Completed`, plus partial delivery support.

**Allowed transitions today**: `SalesService.updateStatus()` (`apps/api/src/sales/sales.service.ts:124`) does `this.prisma.db.salesOrder.update({ where: { id }, data: { status: dto.status as never } })` — no read of `existing.status` used for any comparison, no switch, no adjacency table. `UpdateSalesOrderStatusDto` (`apps/api/src/sales/dto/update-sales-order-status.dto.ts`) validates only `@IsIn(SALES_ORDER_STATUSES)` — any of the 9 enum values is accepted from any current state, including into/out of `CANCELLED`. The DTO's own doc comment explicitly says "enforcing strict forward-only transitions is deferred — see D-022." The route is gated by `Action.APPROVE` on `Resource.SALES_ORDER` (`sales.controller.ts:31`) — a single blanket permission covers every transition type (Draft→Confirmed and Ready→Dispatched need the same permission).

**Unauthorized transitions currently possible**:
- A Sales Order can jump `DRAFT → COMPLETED` in one call, with no Confirmed/Production/Quality/Dispatch step ever occurring and with zero `Dispatch` records or `StockMovement` rows ever created for it.
- `DISPATCHED → DRAFT` (or any "backwards" transition) is accepted identically to a forward one — nothing distinguishes regression from progression.
- `CANCELLED → CONFIRMED` (reviving a cancelled order) succeeds with no re-validation of stock/customer/product state.

**Missing validations**:
- Marking `DISPATCHED` or `COMPLETED` via this endpoint has no check that any `Dispatch` record exists for the order (dispatch normally sets status itself — see §5 — but nothing stops an operator from PATCHing status directly and skipping dispatch entirely).
- No check that `items[].deliveredQty` reflects "Ready"/"Dispatched" claims — an order can be marked `DISPATCHED` with every item's `deliveredQty` still `0`.
- No check that a linked `ProductionOrder` exists/is complete before `IN_PRODUCTION`/`QUALITY`/`READY` are set.

**Side effects that should be triggered but aren't**:
- SRS implies "Confirmed" should commit the business to the order; nothing reserves/soft-allocates stock at that point (no stock-reservation concept exists anywhere in the schema).
- Transitioning to `PRODUCTION_PLANNED` doesn't create or link a `ProductionOrder` — that's a fully separate, manually-triggered action (`ProductionService.createOrder`) with only an optional `salesOrderId` FK; the Sales Order's own status is never advanced automatically when a linked Production Order is created or completed.
- The only place `SalesOrder.status` is set automatically (not via this free-form endpoint) is `DispatchService.create()`, which sets it to `DISPATCHED` (full delivery) or `READY` (partial) — see §5. That auto-set can be silently clobbered by a manual PATCH to any other status immediately after.

**Inventory effects**: Sales Order status changes themselves never touch inventory. Inventory is only touched indirectly, later, by a `Dispatch` (ISSUE movement) — see §5.

**Audit requirements**: `updateStatus()` calls `auditService.log()` with `oldValue`/`newValue` on every change (`sales.service.ts:127`) — this is done correctly, capturing user/tenant/timestamp via `TenantContextStore` inside `AuditService.log()`. Create is also logged. **This is the one part of the SRS §15.2 requirement that is genuinely met for Sales.**

#### WF-001 Sales Order status accepts any enum value from any current state
- Severity: P1
- Module: Sales
- File/path: `apps/api/src/sales/sales.service.ts:124-135`, `apps/api/src/sales/dto/update-sales-order-status.dto.ts`
- Current behavior: `updateStatus()` writes `dto.status` directly with no comparison against `existing.status`; the DTO validates only enum membership.
- Expected behavior: Only SRS §6.1's adjacent forward transitions (plus an explicit, audited `CANCELLED` escape hatch from any pre-dispatch state) should be accepted; all others should 400.
- Why it matters: A Draft order can be marked Completed with no production, no quality check, and no dispatch ever having happened — financially and operationally this is indistinguishable from fabricating a completed sale.
- SRS reference: §6.1
- Recommended fix: Introduce a status-transition map (`Record<SalesOrderStatus, SalesOrderStatus[]>`) and enforce it in `updateStatus()` before the `update()` call.
- Test required: For each of the 9 states, assert only the SRS-adjacent next-state(s) succeed and every other target 400s.

#### WF-002 No linkage/verification between Sales Order status and actual Dispatch/Production records
- Severity: P1
- Module: Sales
- File/path: `apps/api/src/sales/sales.service.ts:124-135`
- Current behavior: Status can be set to `DISPATCHED`/`COMPLETED`/`READY` manually with zero corresponding `Dispatch` rows or `deliveredQty` progress.
- Expected behavior: `READY`/`DISPATCHED`/`COMPLETED` should only be reachable through the system-driven paths (dispatch creation, production completion) or should at minimum validate the corresponding evidence exists before accepting a manual transition.
- Why it matters: Dashboards/reports (SRS §12.1/§12.2) would report a sale as fulfilled when nothing physically shipped — directly undermines "real-time visibility into factory operations" (SRS §2.2).
- SRS reference: §6.1, §8.4
- Recommended fix: Either remove manual transition into `DISPATCHED`/`COMPLETED` entirely (system-only) or add a guard requiring `dispatches.length > 0` / `items.every(deliveredQty >= quantity)`.
- Test required: Attempt to PATCH a fresh Draft order straight to `DISPATCHED`; assert rejection (currently succeeds).

#### WF-003 Cancelled orders can be revived and status can move backwards
- Severity: P2
- Module: Sales
- File/path: `apps/api/src/sales/sales.service.ts:124-135`
- Current behavior: `CANCELLED → CONFIRMED` (or any regression, e.g. `READY → DRAFT`) is accepted identically to a forward transition.
- Expected behavior: `CANCELLED` should be terminal (or require an explicit, separately-permissioned "reopen" action); regressions should be disallowed or require a reason/audit note.
- Why it matters: Silent backward movement corrupts the "order status tracking" SRS §6.1 promises and can hide a cancellation from downstream reports.
- SRS reference: §6.1
- Recommended fix: Treat `CANCELLED` as terminal in the transition map; disallow same-direction regressions except via a distinct reopen flow.
- Test required: PATCH a `CANCELLED` order to `CONFIRMED`; assert rejection.

---

### 2. Purchase Order Lifecycle

**States** (`PurchaseOrderStatus`, `schema.prisma:779`): `DRAFT, APPROVED, SENT, PARTIALLY_RECEIVED, RECEIVED, CANCELLED`.
Related: `PurchaseRequestStatus` (`schema.prisma:735`): `DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CONVERTED`.

**SRS-required flow** (§6.2): `Purchase Request → Approval → Purchase Order → Goods Receipt → Quality Check → Inventory`, with "Rejected quantities" support.

**Allowed transitions today**: `ProcurementService.updateOrderStatus()` (`procurement.service.ts:165`) and `updateRequestStatus()` (`procurement.service.ts:70`) both do a direct `update({ data: { status: dto.status } })` with **no switch/guard** comparing to the current status. `UpdatePurchaseOrderStatusDto`/`UpdatePurchaseRequestStatusDto` only validate `@IsIn(ENUM_VALUES)`. Both routes are gated by `Action.APPROVE` on `Resource.PURCHASE_ORDER` (`procurement.controller.ts:35,60`) — again, one blanket permission for every transition, including non-approval ones like `SENT`/`CANCELLED`.

**Unauthorized transitions currently possible**:
- A Purchase Order can go `DRAFT → RECEIVED` directly via the status endpoint, with zero `GoodsReceipt` records ever created and zero inventory movement — contradicting the entire premise of §6.2's flow.
- `CANCELLED → APPROVED` is accepted (a cancelled PO can be un-cancelled and approved).
- A Purchase Request can jump `DRAFT → CONVERTED` without ever passing through `PENDING_APPROVAL`/`APPROVED` — bypassing the "Approval" stage of §6.2 entirely via the status PATCH endpoint (separately from the legitimate `CONVERTED` auto-set in `createOrder()`, which at least requires a real PO to exist).

**Missing validations**:
- **Segregation of duties**: `updateOrderStatus`/`updateRequestStatus` are gated only by "does this user's role have `Action.APPROVE` on `Resource.PURCHASE_ORDER`" (`rbac.constants.ts`). Neither `PurchaseOrder` nor `PurchaseRequest` even has a `createdBy`/`requestedBy`-comparable field on the order model itself (`PurchaseRequest.requestedBy` exists but is never read back in `updateRequestStatus`), so there is no code path that could reject "approver == creator" even if desired. Per SRS default role permissions (`rbac.constants.ts:173-176`), `PURCHASE_MANAGER` gets `STANDARD_WITH_DELETE` (no `APPROVE`) on `PURCHASE_ORDER` — so the *default* Purchase Manager role cannot self-approve — but Company Owner/Company Admin (which get the `APPROVAL` action set, `rbac.constants.ts:121`) can both create and approve the same PO with no system check, and any tenant admin could grant `APPROVE` to the Purchase Manager role via the permission matrix with no code-level segregation-of-duties backstop.
- `updateOrderStatus` can set `RECEIVED`/`PARTIALLY_RECEIVED` manually — these are also set automatically and correctly by `createGoodsReceipt()` (see below), so the manual and automatic paths can directly contradict each other (manual PATCH after a receipt can silently revert `RECEIVED` back to `DRAFT`, orphaning the receipt records).

**Side effects that should be triggered but aren't**:
- "Approval" per §6.2 is not a distinct guarded step with its own business rules (e.g., approval limits, mandatory different approver) — it's just another accepted enum value behind a single permission flag.
- No side effect ties `PurchaseRequestStatus.APPROVED` to auto-creating a draft `PurchaseOrder`; a request can be `APPROVED` and then never converted, with no reminder/notification (the SRS §12.7 "Pending approval / purchase approval" notification type exists in the schema but nothing in Procurement calls a notify hook — see Maintenance section for the same gap pattern).

**Inventory effects**: **Goods Receipt inventory posting happens synchronously inside `createGoodsReceipt()`** (`procurement.service.ts:220-242`) — for every item with `acceptedQty > 0`, `InventoryService.recordMovement(... type: 'RECEIVE' ...)` is called immediately as part of receipt creation. There is **no separate Quality Check gate**: `GoodsReceiptStatus.PENDING_QC` is the schema default but is effectively unreachable through the API — `createGoodsReceipt()` always computes `status: allAccepted ? 'ACCEPTED' : 'PARTIALLY_ACCEPTED'` at creation time (`procurement.service.ts:206`), so a receipt is never left in `PENDING_QC` for a separate inspection step to later approve before inventory is posted. **This directly contradicts SRS §6.2's explicit "Goods Receipt → Quality Check → Inventory" ordering** — inventory is updated at Goods Receipt time, with "quality check" collapsed into the same request (`acceptedQty`/`rejectedQty` fields on the same DTO) rather than being a distinct, later-gated step.

**Audit requirements**: `createRequest`, `updateRequestStatus`, `createOrder`, `updateOrderStatus`, `createGoodsReceipt` all call `auditService.log()` (`procurement.service.ts:39,73,127,168,254`), correctly using `APPROVE`/`REJECT` as the logged action for request/order status changes. This part of §15.2 is genuinely met for Procurement.

#### WF-004 Purchase Order/Request status accepts any transition, bypassing the Approval gate entirely
- Severity: P1
- Module: Procurement
- File/path: `apps/api/src/procurement/procurement.service.ts:70-81,165-176`
- Current behavior: Both status-update methods write the target status unconditionally.
- Expected behavior: `PurchaseRequest` must pass through `PENDING_APPROVAL` before `APPROVED`/`REJECTED`; `PurchaseOrder` must not reach `RECEIVED`/`PARTIALLY_RECEIVED` except via `createGoodsReceipt()`'s own status computation.
- Why it matters: A PO can be marked `RECEIVED` with no goods ever physically received and no inventory movement — directly breaks §6.2's controlled approval workflow and can be used to fabricate inventory-in-transit records or hide a missing delivery.
- SRS reference: §6.2
- Recommended fix: Status-transition map per enum; block `RECEIVED`/`PARTIALLY_RECEIVED` from the manual PATCH endpoint entirely (system-only, set exclusively by goods receipt processing).
- Test required: PATCH a fresh `DRAFT` PO to `RECEIVED`; assert rejection. PATCH a `DRAFT` request to `CONVERTED`; assert rejection.

#### WF-005 No segregation-of-duties enforcement on Purchase Order/Request approval
- Severity: P1
- Module: Procurement
- File/path: `apps/api/src/procurement/procurement.service.ts:70-81,165-176`; `prisma/schema.prisma:735-819` (no `createdBy` field on either model)
- Current behavior: Approval is gated purely by `Action.APPROVE` role permission; there is no check that the approver differs from the creator, and the schema doesn't even store a comparable creator field on `PurchaseOrder`.
- Expected behavior: The system should record who created/requested a PO/PR and reject (or at minimum flag) an approval performed by that same user, per standard procurement controls implied by §6.2's "controlled approval workflow" language.
- Why it matters: Any single user with both CREATE and APPROVE permission (plausible for several default roles) can originate and approve their own purchase, defeating the entire purpose of a distinct "Approval" stage.
- SRS reference: §6.2 ("Procurement shall follow a controlled approval workflow")
- Recommended fix: Add `createdBy`/`requestedBy` linkage to `PurchaseOrder`, and check `approverId !== createdBy` in `updateOrderStatus`/`updateRequestStatus` before allowing `APPROVED`.
- Test required: As a user with both CREATE and APPROVE permission, create then approve the same PO; assert this either requires a second approver or is explicitly flagged/logged as a self-approval.

#### WF-006 Goods Receipt inventory posts before any distinct Quality Check step — SRS ordering violated
- Severity: P1
- Module: Procurement
- File/path: `apps/api/src/procurement/procurement.service.ts:180-261`; `prisma/schema.prisma:840-845` (`GoodsReceiptStatus.PENDING_QC` unreachable)
- Current behavior: `createGoodsReceipt()` computes `acceptedQty`/`rejectedQty` and posts `RECEIVE` stock movements for accepted quantities in the same call that creates the receipt; `status` is immediately `ACCEPTED`/`PARTIALLY_ACCEPTED`, never `PENDING_QC` pending a later inspection.
- Expected behavior: Per SRS §6.2 ("Goods Receipt → Quality Check → Inventory"), a receipt should land in a QC-pending state, and inventory should post only once an inspection recorded against it (or its accepted quantity) has passed.
- Why it matters: Materials can be available for production consumption before any quality gate — the "Quality Check" stage as named in the SRS has no enforcement teeth in Procurement at all (it is functionally merged into the receipt clerk's own accepted/rejected quantity entry, with no independent inspector sign-off required or possible).
- SRS reference: §6.2
- Recommended fix: Split goods-receipt creation from an "accept into inventory" step gated on a QualityInspection outcome; only post `RECEIVE` movements after that gate passes.
- Test required: Create a goods receipt with `acceptedQty > 0`; assert no `StockMovement` exists until a passing inspection is separately recorded (currently the movement exists immediately).

---

### 3. Production Order Lifecycle (+ Production Batch)

**States**:
- `ProductionOrderStatus` (`schema.prisma:936`): `PLANNED, RELEASED, IN_PROGRESS, PAUSED, COMPLETED, CANCELLED`.
- `BatchStatus` (`schema.prisma:989`): `IN_PROGRESS, COMPLETED, HOLD`.

**SRS-required flow**: No explicit named status-flow diagram for Production Order in the SRS (unlike Sales/Procurement), but §7.1/§7.3/§7.4 require production orders/batches to track planning → execution → output/wastage/rework/rejection, with WIP tracking implying an order shouldn't be `COMPLETED` while work is still outstanding.

**Allowed transitions today**: `ProductionService.updateOrderStatus()` (`production.service.ts:127-142`) writes `dto.status` unconditionally; the only conditional logic is stamping `actualStartDate` (if entering `IN_PROGRESS` and not already set) and `actualEndDate` (if entering `COMPLETED`) — these are side-effect timestamps, not transition guards. `UpdateProductionOrderStatusDto` validates only `@IsIn(PRODUCTION_ORDER_STATUSES)`. `updateBatchStatus()` (`production.service.ts:242-245`) is even more permissive: `return this.prisma.db.productionBatch.update({ where: { id }, data: { status: dto.status } })` — **no read of the existing batch, no side effects, no audit log at all.**

**Unauthorized transitions currently possible**:
- A Production Order can go `PLANNED → COMPLETED` directly (skipping `RELEASED`/`IN_PROGRESS`); because the `IN_PROGRESS` branch is what stamps `actualStartDate`, this produces a `COMPLETED` order with `actualStartDate: null` but `actualEndDate` set — an internally inconsistent record.
- `COMPLETED → IN_PROGRESS` (reopening a completed order) is accepted identically to a forward move.
- A Production Batch can be forced `HOLD → COMPLETED → HOLD` repeatedly via `updateBatchStatus`, with zero record of who did it or when (no audit call in that method at all).

**Missing validations**:
- **No check that a Production Order's linked batches sum to the ordered quantity before `COMPLETED`.** `updateOrderStatus()` never queries `batches` at all — a 1000-unit order can be marked `COMPLETED` with zero batches, or with batches summing to 10 units, with no warning.
- `recordBatchOutput()` (`production.service.ts:210-240`) never validates `outputQuantity + wastage + rework + rejection <= inputQuantity` — a batch can report more output than was input.
- `recordBatchOutput()` unconditionally sets `status: 'COMPLETED'` regardless of the batch's current status — including overwriting a `HOLD` status that a failed Quality Inspection had just set (see §6 below for the exact interaction). This is a genuine regression path, not just a missing check.

**Side effects that should be triggered but aren't**:
- Nothing updates the linked `SalesOrder.status` when a Production Order or its batches complete — the `IN_PRODUCTION`/`QUALITY`/`READY` progression on the Sales Order side (§1) is entirely disconnected from actual Production Order/Batch state; a Sales Order's status and its linked Production Order's status can diverge arbitrarily.
- Nothing prevents `assignedMachine` from being left `RUNNING`/`IDLE` inconsistently with the order's own status (e.g., an order moved to `PAUSED` doesn't touch `Machine.status`).

**Inventory effects**: Production touches inventory in two places, both immediate/unconditional relative to any quality gate: (1) `recordConsumption()` (`production.service.ts:250-283`) issues a `CONSUMPTION` movement (negative quantity) the instant it's called, with no check that a batch/order is even `IN_PROGRESS`; (2) `recordBatchOutput()` posts a `PRODUCTION_RECEIPT` movement for `outputQuantity` immediately if `outputWarehouseId` is supplied, regardless of the batch's quality-inspection state (see §6) — finished output enters sellable/dispatchable stock before any inspection has necessarily occurred.

**Audit requirements**: `createOrder`, `updateOrderStatus`, `createBatch`, `recordBatchOutput`, `recordConsumption` all call `auditService.log()`. **`updateBatchStatus()` does not call `auditService.log()` at all** (`production.service.ts:242-245`) — a Production Batch status change (including a HOLD being manually cleared) is completely invisible to the audit trail, violating SRS §15.2's "create, update, and delete actions" requirement for this specific mutation.

#### WF-007 Production Order status accepts any transition with no batch-quantity or sequencing validation
- Severity: P1
- Module: Production
- File/path: `apps/api/src/production/production.service.ts:127-142`
- Current behavior: Direct unconditional status write; only conditional logic is timestamp stamping, not a transition guard.
- Expected behavior: `COMPLETED` should require `batches` to exist and their summed `outputQuantity` (+ wastage/rework/rejection, as applicable) to reasonably account for `quantity`; `PLANNED → COMPLETED` without passing through `IN_PROGRESS` should be rejected or at least flagged.
- Why it matters: A 1000-unit production order can be marked Completed with zero units actually produced, corrupting the Production Dashboard's "target vs. actual" and "completion percentage" metrics (SRS §12.2) and any downstream costing.
- SRS reference: §7.1, §7.3, §12.2
- Recommended fix: Add a completion guard comparing `sum(batches.outputQuantity)` against `quantity`; introduce a transition map for the 6 states.
- Test required: Mark a freshly created Production Order (zero batches) `COMPLETED`; assert rejection or a required override flag (currently succeeds silently).

#### WF-008 `recordBatchOutput` unconditionally overwrites batch status to COMPLETED, erasing a prior HOLD
- Severity: P1
- Module: Production
- File/path: `apps/api/src/production/production.service.ts:210-240`
- Current behavior: `data: { ..., status: 'COMPLETED' }` is set on every call to `recordBatchOutput`, with no check of the batch's current status.
- Expected behavior: If a batch is currently `HOLD` (e.g., because a Quality Inspection recorded `REJECT`/`HOLD` against it — see WF-013), a subsequent output-recording call should not silently clear that hold back to `COMPLETED`.
- Why it matters: This is the concrete mechanism by which a quality Hold/Reject becomes non-durable — see §6's Hold/Reject enforcement gap. A batch already flagged for quality follow-up can have its hold erased by an ordinary output-recording action, likely unintentionally.
- SRS reference: §7.4, §9.1
- Recommended fix: Only set `status: 'COMPLETED'` if the batch isn't currently `HOLD`, or require an explicit separate "release from hold" action.
- Test required: Put a batch on `HOLD` via a Reject inspection, then call `recordBatchOutput` again for the same batch; assert status remains `HOLD` (currently flips to `COMPLETED`).

#### WF-009 `updateBatchStatus` has no audit logging and no validation whatsoever
- Severity: P2
- Module: Production
- File/path: `apps/api/src/production/production.service.ts:242-245`
- Current behavior: `return this.prisma.db.productionBatch.update({ where: { id }, data: { status: dto.status } })` — no `auditService.log()` call, no read of existing status, no side effects.
- Expected behavior: Every status mutation should be audit-logged per SRS §15.2, and this endpoint should at minimum be consistent with `recordBatchOutput`'s status handling rather than an independent, unguarded bypass.
- Why it matters: A batch's Hold can be cleared via this endpoint with literally no record of who did it or when — a bigger gap than the free-form-but-logged pattern seen elsewhere.
- SRS reference: §15.2
- Recommended fix: Add `auditService.log()` with old/new status; fold into the same transition-map fix as WF-008.
- Test required: Call `PATCH /production-batches/:id/status` and confirm an `AuditLog` row is created (currently none is).

---

### 4. Goods Receipt Lifecycle

*(Also implemented inside `apps/api/src/procurement/`; see §2 for the Purchase Order interaction — this section focuses on the receipt itself.)*

**States** (`GoodsReceiptStatus`, `schema.prisma:840`): `PENDING_QC, ACCEPTED, PARTIALLY_ACCEPTED, REJECTED`.

**SRS-required flow** (§6.2/§8.3): receipt against a PO, with partial receipts and rejected-quantity handling, gated by a Quality Check before the accepted portion enters inventory.

**Allowed transitions today**: There is **no status-update endpoint for `GoodsReceipt` at all** — `procurement.controller.ts` exposes only `POST /goods-receipts`, `GET /goods-receipts`, `GET /goods-receipts/:id`. Status is set exactly once, at creation, computed as `allAccepted ? 'ACCEPTED' : 'PARTIALLY_ACCEPTED'` (`procurement.service.ts:197-206`).

**Unauthorized transitions currently possible**: N/A in the free-form sense (no endpoint to mistransition through) — but the *reachable state set* is itself wrong: `PENDING_QC` and `REJECTED` are declared in the schema but **never produced by any code path**, so the two states that would represent "awaiting inspection" and "fully rejected receipt" are permanently dead.

**Missing validations**:
- No validation that `acceptedQty + rejectedQty <= receivedQty` per item — a client could submit `receivedQty: 100, acceptedQty: 100, rejectedQty: 50` and both values would be accepted and separately incremented onto `PurchaseOrderItem.receivedQty`/`rejectedQty` (`procurement.service.ts:223-229`), overstating both.
- No validation against double-receiving beyond the PO item's ordered `quantity` — `receivedQty` can exceed `quantity` indefinitely across repeated receipts with no cap check.

**Side effects that should be triggered but aren't**: A receipt with `rejectedQty > 0` doesn't create any linked `QualityInspection` record, `Defect` record, or notification — SRS §6.2 lists "Rejected quantities" as a supporting feature, and the field is captured, but nothing downstream (quality traceability, supplier rating impact, notification) reacts to it.

**Inventory effects**: See WF-006 above — inventory posts for `acceptedQty` synchronously within the same `createGoodsReceipt()` call, with no separate QC gate.

**Audit requirements**: `createGoodsReceipt()` logs `CREATE` (`procurement.service.ts:254-259`). Met for the one mutation that exists; there's no separate transition to audit since there's no status-update endpoint.

#### WF-010 Goods Receipt has no server-side check that accepted+rejected reconcile with received quantity
- Severity: P2
- Module: Procurement
- File/path: `apps/api/src/procurement/procurement.service.ts:181-261`; `apps/api/src/procurement/dto/goods-receipt.dto.ts`
- Current behavior: `receivedQty`, `acceptedQty`, `rejectedQty` are three independently validated (`@Min(0)`) numbers with no cross-field relationship enforced.
- Expected behavior: `acceptedQty + rejectedQty` should not exceed `receivedQty` for a given line.
- Why it matters: Inventory and purchase-order-item running totals (`receivedQty`, `rejectedQty` on `PurchaseOrderItem`) can be inflated beyond what physically arrived, corrupting supplier performance and outstanding-PO reporting.
- SRS reference: §6.2 ("Rejected quantities")
- Recommended fix: Add a DTO-level or service-level check: `acceptedQty + (rejectedQty ?? 0) <= receivedQty`.
- Test required: Submit a goods receipt item with `receivedQty: 10, acceptedQty: 10, rejectedQty: 5`; assert rejection (currently succeeds).

#### WF-011 `PENDING_QC` and `REJECTED` GoodsReceiptStatus values are unreachable dead states
- Severity: P3
- Module: Procurement
- File/path: `prisma/schema.prisma:840-845`; `apps/api/src/procurement/procurement.service.ts:206`
- Current behavior: Status is computed to always be `ACCEPTED` or `PARTIALLY_ACCEPTED` at creation; no code path ever writes `PENDING_QC` or `REJECTED`.
- Expected behavior: If the enum is meant to represent a real lifecycle (as its name and SRS §6.2 suggest), a receipt with zero accepted quantity across all items should be reachable as `REJECTED`, and (per WF-006's fix) receipts should start `PENDING_QC` before a QC step resolves them.
- Why it matters: Dead enum states are a documentation/implementation mismatch that will confuse a future state-machine implementer into thinking QC gating already exists.
- SRS reference: §6.2
- Recommended fix: Either remove the two unused values (if QC-gating is intentionally out of scope for now) or wire them up as part of the WF-006 fix.
- Test required: N/A (static/structural finding) — confirm via code search that no `status: 'PENDING_QC'` or `'REJECTED'` write exists.

---

### 5. Dispatch Lifecycle

**States** (`DispatchStatus`, `schema.prisma:1241`): `PLANNED, PACKED, DISPATCHED, DELIVERED, CANCELLED`.

**SRS-required flow** (§8.4): dispatch orders and finished-goods allocation, packing/roll details, vehicle/driver/delivery info, **partial dispatch**, dispatch documents.

**Allowed transitions today**: **There is no status-update endpoint for Dispatch at all.** `dispatch.controller.ts` exposes only `POST /dispatches`, `GET /dispatches`, `GET /dispatches/:id`. `DispatchService.create()` hardcodes `status: 'DISPATCHED'` at creation (`dispatch.service.ts:39`) — every dispatch is born already in its terminal-ish state. `PLANNED`, `PACKED`, and `DELIVERED` are declared in the schema but **never producible by any code path** — the "packing" stage SRS §8.4 explicitly calls out has no corresponding workflow step; it's collapsed into the single create call alongside vehicle/driver info.

**Unauthorized transitions currently possible**: N/A via a status endpoint (none exists) — but structurally, "possible" here means: a Dispatch is created and instantly `DISPATCHED` with **no check that the linked Sales Order is in `READY` (or any particular) status**, and **no check that a Quality Inspection passed** for the batch(es) being shipped (see §6). Concretely:
- A `Dispatch` can be created against a Sales Order still in `DRAFT` status — `dispatch.service.ts:22-26` fetches the order only to check it exists, never checks `salesOrder.status`.
- A `Dispatch` can specify `batchNumber` for a batch that a Quality Inspection just marked `REJECT` — nothing cross-references `ProductionBatch.status` or any `QualityInspection.outcome` at all.
- Two independent dispatches can each claim quantity against the same `SalesOrderItem` beyond its remaining balance — `deliveredQty` is incremented (`dispatch.service.ts:70-75`) with no check that `deliveredQty + item.quantity(new) <= salesOrderItem.quantity`, so over-dispatch beyond what was ordered is possible.

**Missing validations**:
- No cap check: dispatched quantity per line can exceed the Sales Order item's ordered quantity.
- No check that requested `quantity`/`batchNumber` actually has sufficient/matching stock before issuing (that's `InventoryService`'s concern per the separate inventory audit, but Dispatch itself adds no pre-check of its own before calling `recordMovement`).
- No status/QC check as above.

**Side effects that should be triggered but aren't**: SRS §8.4 implies a `PLANNED`/`PACKED` pre-dispatch stage (packing and roll/package detail capture before the vehicle leaves) — there is no such intermediate state; `rollOrPackageDetails` (Json field on `DispatchItem`) can be populated but nothing gates transition to `DISPATCHED` on that being filled in.

**Inventory effects**: Dispatch **does** correctly and immediately issue stock: for every item, `InventoryService.recordMovement(..., type: 'ISSUE', quantity: -Math.abs(item.quantity) ...)` is called inline in `create()` (`dispatch.service.ts:58-68`), and the linked `SalesOrderItem.deliveredQty` is incremented in the same flow, with the Sales Order's own status correctly rolled to `DISPATCHED` (full) or `READY` (partial) at the end (`dispatch.service.ts:78-83`). **This is the one place in the whole audit where SRS §6.1's "Dispatched" status update is genuinely, automatically enforced** — it's the manual PATCH path on Sales Order (WF-001/WF-002) that can undermine it after the fact.

**Audit requirements**: `create()` logs `CREATE` (`dispatch.service.ts:85-90`). Met for the one mutation that exists.

#### WF-012 Dispatch can be created against a Sales Order in any status, with no Ready/Confirmed precondition
- Severity: P1
- Module: Dispatch
- File/path: `apps/api/src/dispatch/dispatch.service.ts:18-30`
- Current behavior: `salesOrder` is fetched only to confirm it exists; `salesOrder.status` is never inspected before proceeding to issue stock and create the dispatch.
- Expected behavior: Dispatch creation should require the Sales Order to be in `READY` (or `QUALITY`/`READY`, per SRS ordering) before allowing stock issuance against it.
- Why it matters: Goods can physically leave the warehouse (real `StockMovement` posted) against an order that was never confirmed, never entered production, and never passed quality — a hard operational/financial risk, not a cosmetic one.
- SRS reference: §6.1, §8.4
- Recommended fix: Add a precondition check (`salesOrder.status === 'READY'`) at the top of `DispatchService.create()`.
- Test required: Create a Sales Order, leave it `DRAFT`, immediately create a Dispatch against it; assert rejection (currently succeeds and issues stock).

#### WF-013 Dispatch has no awareness of Quality Inspection outcome — a Rejected/Held batch can be dispatched
- Severity: P1
- Module: Dispatch / Quality
- File/path: `apps/api/src/dispatch/dispatch.service.ts:18-92`; `apps/api/src/quality/quality.service.ts:60-62`
- Current behavior: `DispatchItem.batchNumber` is a free-text-equivalent field with no FK to `ProductionBatch` or `QualityInspection`; `DispatchService.create()` never queries either. The only place batch status is touched by quality is `QualityService.createInspection()` setting `ProductionBatch.status = 'HOLD'` on Reject/Hold outcome — and (per WF-008) even that is not durable against a later `recordBatchOutput` call.
- Expected behavior: Dispatch should refuse to issue stock for a batch whose most recent (or any) Quality Inspection outcome is `REJECT` or unresolved `HOLD`.
- Why it matters: This is the core question the audit brief asked to verify directly: **a batch that failed inspection can currently still be dispatched to a customer** — Hold/Reject is purely informational (a status flag on the batch row) with zero enforcement anywhere in the dispatch path.
- SRS reference: §9.1 ("Pass, Rework, Hold, Reject"), §9.2 (traceability), §8.4
- Recommended fix: Before issuing stock in `DispatchService.create()`, resolve the batch (via `batchNumber` → `ProductionBatch`) and reject if its status is `HOLD` or if its latest `QualityInspection.outcome` is `REJECT`.
- Test required: Record a Reject inspection against a batch, then attempt to dispatch stock tagged with that batch's number; assert rejection (currently succeeds).

#### WF-014 Dispatch can over-deliver beyond the Sales Order item's ordered quantity
- Severity: P2
- Module: Dispatch
- File/path: `apps/api/src/dispatch/dispatch.service.ts:58-83`
- Current behavior: `deliveredQty: { increment: item.quantity }` is applied with no cap check against `salesOrderItem.quantity`.
- Expected behavior: A dispatch item's quantity should be capped at `salesOrderItem.quantity - salesOrderItem.deliveredQty`.
- Why it matters: Enables shipping more than was ordered/paid for with no system pushback, and skews the "partial delivery" tracking SRS §6.1 calls for.
- SRS reference: §6.1, §8.4
- Recommended fix: Validate remaining balance per line before creating the dispatch item / issuing stock.
- Test required: Dispatch 150 units against a 100-unit ordered line; assert rejection or clamping (currently accepts in full).

---

### 6. Inspection (Quality) Lifecycle

**States** (`QualityOutcome`, `schema.prisma:1322`): `PASS, REWORK, HOLD, REJECT`.

**SRS-required outcomes** (§9.1): Pass, Rework, Hold, Reject — with full traceability per §9.2.

**Allowed transitions today**: There is no "transition" in the traditional sense — a `QualityInspection` is an immutable, append-only record (`createInspection` only; no update/status-change endpoint exists in `quality.controller.ts`). The only state-machine-relevant behavior is the **one-way side effect** on `ProductionBatch.status`.

**Enforcement question (asked explicitly in the brief): does Hold/Reject block downstream progress?**
**No — enforcement is effectively nonexistent, and even the one side effect that exists is not durable.**
- `createInspection()` (`quality.service.ts:60-62`): `if (dto.productionBatchId && (outcome === 'REJECT' || outcome === 'HOLD')) { productionBatch.update({ status: 'HOLD' }) }` — this is the **entire** enforcement surface in the whole Quality module.
- That `HOLD` is silently overwritten back to `COMPLETED` by any subsequent `recordBatchOutput()` call (WF-008) — meaning even the one guard that exists can be erased by an unrelated, permitted action.
- Dispatch never reads `ProductionBatch.status` or `QualityInspection.outcome` at all (WF-013) — so even while `HOLD` is in effect, dispatching stock tagged with that batch's number is unaffected.
- Goods-Receipt-linked inspections (`goodsReceiptId` on `QualityInspection`) have **zero** enforcement effect on the `GoodsReceipt` or `PurchaseOrderItem` records — `goodsReceiptId` is a loose field with no Prisma relation back-reference and nothing reads it to gate anything (confirmed: `GoodsReceipt` has no `qualityInspections` relation in the schema).
- Sales-Order-linked inspections (`salesOrderId` on `QualityInspection`) similarly have no effect on `SalesOrder.status`.

**Unauthorized transitions currently possible** (interpreted as: outcomes that should block but don't):
- A batch inspected `REJECT` can still have its output received into finished-goods stock via `recordBatchOutput` immediately after (or even before) the inspection is recorded — there's no ordering dependency between the two calls at all.
- A batch inspected `REJECT` and put on `HOLD` can be dispatched to a customer with no system objection (WF-013).
- A second inspection recorded `PASS` on the same batch after an earlier `REJECT` doesn't clear or reconcile the `HOLD` — there's no logic reading prior inspections at all when creating a new one; each `createInspection` call only looks at its own `dto.outcome`, never the batch's inspection history.

**Missing validations**:
- No requirement that a `ProductionBatch` have at least one `PASS` inspection before its output-warehouse receipt is treated as "released" (there's no such "released" concept at all — output posts to sellable stock unconditionally, see §3).
- No validation preventing multiple conflicting inspections against the same batch without reconciliation.

**Side effects that should be triggered but aren't**:
- Reject/Hold should (per the audit brief's own framing) block downstream progress — it currently blocks nothing beyond a batch-status label that itself gets overwritten.
- No notification is generated on `REJECT` despite SRS §12.7 listing "Quality rejection" as a notification-triggering event — `NotificationsService` exists but `QualityService` never calls into it (consistent with DEVELOPMENT_LOG's own note that "the `notify()` hook still has no producer calling it").

**Inventory effects**: `QualityInspection` creation itself never touches inventory (correct — it's an assessment, not a movement). The problem is the inverse: nothing *else* checks inspection outcome before inventory-affecting actions (`recordBatchOutput`'s `PRODUCTION_RECEIPT`, `Dispatch`'s `ISSUE`) proceed.

**Audit requirements**: `createInspection()` logs `CREATE` with `outcome` in `newValue` (`quality.service.ts:64-69`) — met for the inspection record itself. However, the side-effect batch-status change to `HOLD` is not separately logged as a `ProductionBatch` audit entry (it happens inside the same transaction-less sequence with no `auditService.log()` call for that specific field change) — a reviewer reading the `ProductionBatch` audit trail alone would not see why/when it went on Hold.

#### WF-015 Reject/Hold inspection outcomes are purely informational — no downstream action is blocked
- Severity: P0
- Module: Quality
- File/path: `apps/api/src/quality/quality.service.ts:30-71`; `apps/api/src/production/production.service.ts:210-245`; `apps/api/src/dispatch/dispatch.service.ts:18-92`
- Current behavior: The only enforcement artifact is a `ProductionBatch.status = 'HOLD'` flag, which (a) nothing reads before posting production output to stock, (b) nothing reads before dispatching stock, and (c) is itself overwritten back to `COMPLETED` by a routine `recordBatchOutput` call.
- Expected behavior: A `REJECT` outcome should hard-block the associated batch's output from being dispatched (and arguably from being received into finished-goods stock at all until reworked); a `HOLD` should at minimum block dispatch until explicitly released.
- Why it matters: This is a P0 because it is the exact scenario the audit brief flagged as the critical question — "can a batch that failed inspection still be dispatched?" The answer today is unambiguously yes, with no error, no warning, and no audit trail explaining why a rejected batch shipped.
- SRS reference: §9.1, §9.2
- Recommended fix: (1) Stop `recordBatchOutput` from unconditionally clearing `HOLD` (WF-008); (2) add a Dispatch-time check resolving the batch's latest inspection outcome and rejecting `REJECT`/unresolved `HOLD`; (3) wire a notification on `REJECT` per §12.7.
- Test required: End-to-end: create a batch, record output, record a `REJECT` inspection against it, then attempt to dispatch stock tagged with that batch number — assert rejection. (Currently the full chain succeeds silently.)

#### WF-016 No audit trail for the batch-status side effect of a Quality Inspection
- Severity: P3
- Module: Quality / Production
- File/path: `apps/api/src/quality/quality.service.ts:60-62`
- Current behavior: The `productionBatch.update({ status: 'HOLD' })` call has no accompanying `auditService.log()` entry scoped to `ProductionBatch`.
- Expected behavior: Any state change to `ProductionBatch` — even one triggered as a side effect of another module's action — should be independently traceable per SRS §15.2.
- Why it matters: Reviewing a batch's own history wouldn't reveal why it went on Hold without cross-referencing the Quality Inspection table separately.
- SRS reference: §15.2
- Recommended fix: Add a second `auditService.log({ entityType: 'ProductionBatch', ... })` call alongside the existing inspection log.
- Test required: Record a Reject inspection; query `AuditLog` filtered to `entityType: 'ProductionBatch'`, `entityId: <batch>`; assert an entry exists (currently none).

---

### 7. Maintenance Lifecycle

**States**:
- `MaintenanceType` (`schema.prisma:1388`): `CORRECTIVE, PREVENTIVE`.
- `MaintenanceStatus` (`schema.prisma:1393`): `OPEN, IN_PROGRESS, COMPLETED, CANCELLED`.
- Separately, `MaintenanceSchedule` (no status enum — driven by `nextDueAt`/`lastPerformedAt` datetime fields).

**SRS-required flow** (§9.3): Corrective — auto-created on breakdown; Preventive — system "proactively reminds" the maintenance team of upcoming scheduled maintenance.

**Corrective maintenance auto-creation — verified genuinely working, contrary to the "assume near-zero enforcement" prior**: `DowntimeService.create()` (`downtime.service.ts:18-64`) checks `BREAKDOWN_CATEGORIES = {MECHANICAL, ELECTRICAL}`; if the downtime's category matches, it (a) sets `Machine.status = 'BREAKDOWN'` and (b) creates a `MaintenanceJob` with `type: 'CORRECTIVE'`, `status: 'OPEN'`, linked via `downtimeId` — all inside the same `$transaction` as the downtime record itself. This is real, working, inline logic, not a stub. **This is the one workflow in this audit where DEVELOPMENT_LOG's claim of correct implementation is fully verified as true.**

**Allowed transitions today (Maintenance Job status)**: `MaintenanceService.update()` (`maintenance.service.ts:78-107`) writes `status: dto.status` unconditionally (`UpdateMaintenanceJobDto.status` is `@IsOptional() @IsIn(MAINTENANCE_JOB_STATUSES)` — any of `OPEN/IN_PROGRESS/COMPLETED/CANCELLED` from any current state). The only conditional logic is a side effect: if `dto.status === 'COMPLETED'`, `Machine.status` is set to `'RUNNING'` in the same transaction (`maintenance.service.ts:94-96`).

**Unauthorized transitions currently possible**:
- A `MaintenanceJob` can go `OPEN → COMPLETED` directly, skipping `IN_PROGRESS`, with no `startedAt` ever set (only `completedAt` if the caller supplies it) — `startedAt`/`completedAt` are caller-supplied optional dates, not derived from the transition itself.
- `COMPLETED → OPEN` (reopening) is accepted identically to a forward transition, and — critically — **does not** revert `Machine.status` back to `BREAKDOWN`/`MAINTENANCE`; only the `COMPLETED` branch touches `Machine.status`, so reopening a job leaves the machine incorrectly marked `RUNNING` while its (reopened) maintenance job is again `OPEN`.
- **Two independent, uncoordinated paths clear `BREAKDOWN`/set `RUNNING`**: `DowntimeService.close()` (`downtime.service.ts:66-83`) unconditionally sets `Machine.status = 'RUNNING'` when a downtime record is closed, **regardless of whether the auto-created `MaintenanceJob` linked to it has actually reached `COMPLETED`**. So a technician (or anyone with downtime-close permission) can mark a machine `RUNNING` again while its corrective maintenance job is still `OPEN`/`IN_PROGRESS` — the two status-setting code paths (`DowntimeService.close`, `MaintenanceService.update`) have zero awareness of each other.

**Missing validations**: No check, in either `DowntimeService.close()` or `MaintenanceService.update()`, of the other's state before setting `Machine.status = 'RUNNING'`.

**Preventive maintenance "due" detection — verified schema-driven query only, NOT a scheduled reminder**:
- `MaintenanceSchedule.nextDueAt` is set once, at `createSchedule()` time (`maintenance.service.ts:118`), computed as `now + frequencyDays`.
- `listDueSoon()` (`maintenance.service.ts:138-145`) is a **passive, on-demand query** (`nextDueAt <= now + 7 days`) — it only returns data when something calls it (the Maintenance Dashboard, per `dashboards.service.ts:176`, or a direct API call to `GET /maintenance-schedules/due-soon`). Confirmed via repo-wide search: **there is no `@Cron`/`ScheduleModule`/BullMQ processor anywhere in `apps/api/src`** — no background job periodically evaluates due schedules and pushes a reminder/notification. "Proactively reminds the maintenance team" (§9.3's own wording) is not implemented; what exists is a pull-based dashboard widget that only informs someone who happens to look.
- **`lastPerformedAt` is never written anywhere in the codebase** (confirmed via repo-wide search — the field is declared in the schema and never appears in any `.ts` file outside the schema itself). Completing a `MaintenanceJob` (`MaintenanceService.update()` with `status: 'COMPLETED'`) does not touch the linked `MaintenanceSchedule` at all — there is no FK between `MaintenanceJob` and `MaintenanceSchedule` in the schema, so there's no way to derive which schedule a completed preventive job satisfies. **`nextDueAt` is therefore permanently frozen at its creation-time value and never advances after the first cycle** — after the initial due date passes (serviced or not), the schedule stays "due" (or becomes silently stale/overdue) forever, since nothing recomputes it.

**Side effects that should be triggered but aren't**:
- Completing a job doesn't recompute any linked schedule's `nextDueAt`.
- No notification on `MaintenanceJob` creation (corrective or preventive) or on a schedule becoming due, despite SRS §12.7 listing "Maintenance due" as a notification-triggering event — same `notify()`-hook-has-no-producer gap noted elsewhere.

**Inventory effects**: None — Maintenance doesn't touch `Stock`/`StockMovement` (spare-parts usage is captured only as a free-form `sparePartsUsed: Json?` field with no inventory deduction — out of this section's scope but worth noting as a §11 boundary observation).

**Audit requirements**: `createJob()` and `update()` call `auditService.log()` (`maintenance.service.ts:39-44,99-106`) — met for those two. `createSchedule()` does **not** call `auditService.log()` (`maintenance.service.ts:111-128`) — creating a preventive maintenance schedule (a meaningful configuration change per §15.2's "important configuration changes") is unlogged. `DowntimeService.create()`'s auto-created `MaintenanceJob` (the corrective path) is also not separately audit-logged as its own `MaintenanceJob` `CREATE` entry — only the parent `Downtime` `CREATE` is logged (`downtime.service.ts:62`); the system-triggered `MaintenanceJob` row it produces bypasses the audit trail entirely.

#### WF-017 Maintenance Job status accepts any transition; machine RUNNING/BREAKDOWN state can desync from actual job status
- Severity: P1
- Module: Maintenance
- File/path: `apps/api/src/maintenance/maintenance.service.ts:78-107`; `apps/api/src/downtime/downtime.service.ts:66-83`
- Current behavior: `MaintenanceService.update()` writes any status unconditionally; only `COMPLETED` sets `Machine.status = 'RUNNING'`. Independently, `DowntimeService.close()` also unconditionally sets `Machine.status = 'RUNNING'` with no check of the linked `MaintenanceJob`'s status.
- Expected behavior: A machine should not be marked `RUNNING` while its linked corrective `MaintenanceJob` is `OPEN`/`IN_PROGRESS`; the two code paths that set `Machine.status` should be coordinated (e.g., a single "resolve" operation, or closing downtime should check the linked job's status).
- Why it matters: A supervisor closing a downtime record (a routine, frequently-performed action) can mark a machine as back in production while the actual mechanical/electrical fault's maintenance job remains open — directly contradicts the "no separate trigger/queue needed" design intent described in DEVELOPMENT_LOG, which assumed the two would stay in sync.
- SRS reference: §7.5 (machine status meanings), §9.3
- Recommended fix: In `DowntimeService.close()`, check for an open linked `MaintenanceJob` (via `downtimeId`) before setting `Machine.status = 'RUNNING'`; only allow `RUNNING` if no open corrective job remains, or leave status as `MAINTENANCE` otherwise.
- Test required: Trigger a MECHANICAL downtime (auto-creates an OPEN corrective job), close the downtime immediately without completing the job; assert `Machine.status` is not `RUNNING` (currently it is).

#### WF-018 Preventive Maintenance "due" detection is a passive query, not a scheduled reminder; `nextDueAt` never advances after creation
- Severity: P1
- Module: Maintenance
- File/path: `apps/api/src/maintenance/maintenance.service.ts:109-145`; repo-wide search confirms no `@Cron`/`ScheduleModule`/BullMQ usage exists in `apps/api/src`, and `lastPerformedAt` is never written anywhere.
- Current behavior: `nextDueAt` is set once at `createSchedule()` and never recomputed; `listDueSoon()` only returns results when explicitly queried (dashboard load or direct API call); no background job or notification producer evaluates schedules independently.
- Expected behavior: Per SRS §9.3 ("the system proactively reminds the maintenance team of upcoming scheduled maintenance"), a scheduled job should periodically evaluate due schedules and push a notification (§12.7 "Maintenance due"); completing a preventive job should advance the schedule's `nextDueAt`/`lastPerformedAt` for the next cycle.
- Why it matters: Without this, Preventive Maintenance degrades to schema-only bookkeeping the moment nobody happens to open the dashboard — the exact failure mode SRS §9.3 is meant to prevent (a machine silently going overdue for scheduled maintenance).
- SRS reference: §9.3, §12.6 ("Preventive maintenance due"), §12.7
- Recommended fix: Add a `MaintenanceJob.scheduleId` FK; on job completion (`status: 'COMPLETED'`), update the linked schedule's `lastPerformedAt = now` and `nextDueAt = now + frequencyDays`. Add a BullMQ-scheduled job (infra already anticipates Redis/BullMQ per SRS §17.3) that runs `listDueSoon()`-equivalent logic and calls the notification producer.
- Test required: Complete a preventive `MaintenanceJob`; assert its linked `MaintenanceSchedule.nextDueAt` advances (currently no such linkage/update exists at all).

#### WF-019 Maintenance Schedule creation and the corrective job auto-created by Downtime are not audit-logged
- Severity: P3
- Module: Maintenance
- File/path: `apps/api/src/maintenance/maintenance.service.ts:111-128`; `apps/api/src/downtime/downtime.service.ts:46-60`
- Current behavior: `createSchedule()` has no `auditService.log()` call; the `MaintenanceJob` created inline inside `DowntimeService.create()` for a breakdown also has no dedicated audit entry (only the parent `Downtime` CREATE is logged).
- Expected behavior: Both a new preventive schedule (a configuration change) and a system-triggered `MaintenanceJob` creation should produce their own `AuditLog` entries per §15.2.
- Why it matters: An auditor reviewing `MaintenanceJob` history for a machine would see rows with no corresponding audit trail explaining their creation for the auto-created corrective case.
- SRS reference: §15.2
- Recommended fix: Add `auditService.log()` calls at both sites.
- Test required: Trigger a MECHANICAL downtime; query `AuditLog` for `entityType: 'MaintenanceJob'` matching the newly created job's id; assert an entry exists (currently none).

---

### Summary of findings by severity

| ID | Title | Severity | Module |
|---|---|---|---|
| WF-001 | Sales Order status accepts any enum value from any current state | P1 | Sales |
| WF-002 | No linkage/verification between Sales Order status and actual Dispatch/Production records | P1 | Sales |
| WF-003 | Cancelled orders can be revived and status can move backwards | P2 | Sales |
| WF-004 | Purchase Order/Request status accepts any transition, bypassing the Approval gate entirely | P1 | Procurement |
| WF-005 | No segregation-of-duties enforcement on Purchase Order/Request approval | P1 | Procurement |
| WF-006 | Goods Receipt inventory posts before any distinct Quality Check step | P1 | Procurement |
| WF-007 | Production Order status accepts any transition with no batch-quantity validation | P1 | Production |
| WF-008 | `recordBatchOutput` unconditionally overwrites batch status to COMPLETED, erasing a prior HOLD | P1 | Production |
| WF-009 | `updateBatchStatus` has no audit logging and no validation whatsoever | P2 | Production |
| WF-010 | Goods Receipt has no check that accepted+rejected reconcile with received quantity | P2 | Procurement |
| WF-011 | `PENDING_QC`/`REJECTED` GoodsReceiptStatus values are unreachable dead states | P3 | Procurement |
| WF-012 | Dispatch can be created against a Sales Order in any status | P1 | Dispatch |
| WF-013 | Dispatch has no awareness of Quality Inspection outcome — a Rejected/Held batch can be dispatched | P1 | Dispatch / Quality |
| WF-014 | Dispatch can over-deliver beyond the Sales Order item's ordered quantity | P2 | Dispatch |
| WF-015 | Reject/Hold inspection outcomes are purely informational — no downstream action is blocked | P0 | Quality |
| WF-016 | No audit trail for the batch-status side effect of a Quality Inspection | P3 | Quality / Production |
| WF-017 | Maintenance Job status accepts any transition; machine RUNNING/BREAKDOWN state can desync | P1 | Maintenance |
| WF-018 | Preventive Maintenance "due" detection is a passive query, not a scheduled reminder | P1 | Maintenance |
| WF-019 | Maintenance Schedule creation and auto-created corrective jobs are not audit-logged | P3 | Maintenance |

**Totals: 1 P0, 9 P1, 4 P2, 3 P3 — 19 findings across 7 workflows (Goods Receipt counted under Procurement).**

---

## 12. API Audit

*(Full endpoint enumeration -- 139 endpoints, 28 controllers -- and findings from the dedicated API Audit stream.)*

> **Editorial reconciliation note (added during synthesis):** API-001 (Goods Receipt creation not transaction-wrapped) and the Inventory Integrity stream INV-005 (Section 10) describe the same underlying defect from two angles, scored P0 and P2 respectively. Given the confirmed real-world consequence -- a receipt document and purchase-order rollup that silently disagree with the actual stock ledger after a mid-loop failure, with no error surfaced to the user, in a financial/inventory-accuracy-critical operation -- this synthesis adopts API-001 P0 severity as the reconciled assessment. The master severity lists (Section 18) count this once, as API-001, at P0.

## Section 12 — API Audit

Scope: exhaustive enumeration of every backend REST endpoint in `apps/api/src/` (28 controllers), cross-checked against the matching service files for transaction wrapping, audit logging, and tenant scoping. Read in full: all 28 `*.controller.ts` files, `main.ts`, `app.module.ts`, the global guards/interceptors (`JwtAuthGuard`, `PermissionsGuard`, `PlatformAdminGuard`, `TenantContextInterceptor`, `ResponseInterceptor`), the Prisma tenant-scoping extension (`prisma.service.ts`, `tenant-scoped-models.ts`), `rbac.constants.ts`, and the service/DTO files for every module that performs a multi-write or financially/inventory-relevant mutation (sales, procurement, production, inventory, dispatch, quality, payroll, costing, downtime, notifications, users, auth, roles).

### 0. Framework-level checks (SRS §17.7)

- **Versioning**: `main.ts` calls `app.setGlobalPrefix('api')` + `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })`. Confirmed all routes resolve under `/api/v1/...`. No controller's `@Controller()` path duplicates `api` or `v1` (spot-checked all 28 — each uses a bare resource path, e.g. `@Controller('sales-orders')`). **Compliant.**
- **DTO validation**: Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` is registered in `main.ts`. Every mutating endpoint across all 28 controllers binds `@Body()` to a `class-validator`-decorated DTO class — no controller accepts a raw/untyped body. **Compliant** (see §3 for DTO *quality* gaps, which are narrower than "missing").
- **Consistent response structure**: Global `ResponseInterceptor` wraps every success response in `{ data, meta? }`; `AllExceptionsFilter` is registered as `APP_FILTER`. **Compliant** (envelope shape verified in `common/interceptors/response.interceptor.ts`).
- **Authorization + tenant checks on every endpoint**: `JwtAuthGuard`, `PermissionsGuard` are both global (`APP_GUARD`), so every route requires a valid JWT unless `@Public()`, and every route with `@RequirePermission()` is enforced. `TenantContextInterceptor` establishes an `AsyncLocalStorage` tenant context consumed by a Prisma query-extension (`PrismaService.db`) that auto-injects `tenantId` into every operation against the 37 models in `TENANT_SCOPED_MODELS`. **Largely compliant** — see API-006/API-007 for the two places this safety net is bypassed via the `.raw` escape hatch outside of the platform-admin/login code paths it's meant for.
- **Swagger/OpenAPI**: `SwaggerModule` is wired in `main.ts`, gated by `if (!isProduction)`, served at `api/docs`, with `.addBearerAuth()` on the `DocumentBuilder`. This is real, not a stub. However, **none of the 28 controllers use `@ApiTags`/`@ApiOperation`/`@ApiBearerAuth`** — the generated document relies entirely on Nest's auto-introspection of DTO classes and route decorators, with no operation summaries, grouping tags, or per-route security annotations. Functional but minimal; see API-014.

Total tenant-scoped Prisma models: 37 (`TENANT_SCOPED_MODELS` in `prisma/tenant-scoped-models.ts`). Global throttle default: 100 req/60s (`ThrottlerModule.forRoot`). Auth endpoints override with tighter limits (`login`/`forgot-password`/`reset-password`: 5/60s; `refresh`: 20/60s).

---

### 1. Endpoint enumeration

Legend — **Tenant-scoped**: Y = via `prisma.db` (auto-injected tenantId); Y* = via `.raw` but safe because a prior tenant-scoped lookup already validated the parent ID (documented D-014 child-of-parent pattern); N = via `.raw` on a model that IS tenant-scoped, bypassing the safety net (flagged as a finding). **Audit**: Y = explicit `AuditService.log()` call for this action; — = read-only, no audit expected.

#### tenants (`tenants.controller.ts`) — platform-admin + self-service, 6 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| POST | /tenants | Y | PlatformAdminGuard (not RequirePermission) | CreateTenantDto | N/A (platform-level, `.raw` by design) | Y | Provisioning; correct to bypass RBAC/tenant scoping — this is the tenant-creation flow itself |
| GET | /tenants | Y | PlatformAdminGuard | PaginationQueryDto | N/A | — | |
| GET | /tenants/:id | Y | PlatformAdminGuard | — | N/A | — | |
| PATCH | /tenants/:id/status | Y | PlatformAdminGuard | UpdateTenantStatusDto | N/A | Y | |
| GET | /tenants/me/company | Y | tenant:VIEW | — | Y | — | |
| PATCH | /tenants/me/company | Y | tenant:UPDATE | UpdateTenantDto | Y | Y | |

#### users (`users.controller.ts`) — 5 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| GET | /users/me | Y | none (self, by design) | — | Y | — | Comment explicitly documents the intentional no-permission self-read |
| POST | /users | Y | user:CREATE | InviteUserDto | Y | Y | |
| GET | /users | Y | user:VIEW | PaginationQueryDto | Y | — | Uses `USER_LIST_SELECT`, excludes `passwordHash`/refresh tokens — no over-exposure |
| GET | /users/:id | Y | user:VIEW | — | Y | — | |
| PATCH | /users/:id | Y | user:UPDATE | UpdateUserDto | Y | Y | Role/factory reassignment wrapped in `$transaction` |

#### roles (`roles.controller.ts`) — 3 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| GET | /roles | Y | role:VIEW | — | Y | — | |
| GET | /roles/:id | Y | role:VIEW | — | Y | — | |
| PUT | /roles/:id/permissions | Y | role:UPDATE | SetRolePermissionsDto | **N** (`.raw`) | Y (PERMISSION_CHANGE) | See API-007. Uses PUT for a full-replace of the permission set — semantically defensible, not flagged |

#### factories (`factories.controller.ts`) — 4 endpoints — all Y/Y/Y/Y (standard CRUD, `factory:*`, tenant-scoped via `.db`, create/update audited)

#### departments (`departments.controller.ts`, nested under `/factories/:factoryId/departments`) — 4 endpoints — standard CRUD, `department:*`, tenant-scoped, audited

#### warehouses (`warehouses.controller.ts`, nested under `/factories/:factoryId/warehouses`) — 6 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| POST | /factories/:factoryId/warehouses | Y | warehouse:CREATE | CreateWarehouseDto | Y | Y | |
| GET | /factories/:factoryId/warehouses | Y | warehouse:VIEW | — | Y | — | |
| GET | /factories/:factoryId/warehouses/:id | Y | warehouse:VIEW | — | Y | — | |
| PATCH | /factories/:factoryId/warehouses/:id | Y | warehouse:UPDATE | UpdateWarehouseDto | Y | Y | |
| POST | /factories/:factoryId/warehouses/:id/locations | Y | warehouse:CREATE | CreateLocationDto | Y* (`.raw`, `Location` not in tenant-scoped list, parent already checked) | — | Not audited — minor (location is metadata, low risk) |
| GET | .../:id/locations | Y | warehouse:VIEW | — | Y* | — | |

#### health (`health.controller.ts`) — 1 endpoint

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| GET | /health | @Public() | none | — | N/A (`raw.$queryRaw SELECT 1`) | — | Correct — liveness probe must be public |

#### products (`products.controller.ts`) — 6 endpoints — categories + products CRUD, `product:*`, tenant-scoped, create/update audited

#### materials (`materials.controller.ts`) — 4 endpoints — standard CRUD, `material:*`, tenant-scoped, audited

#### customers (`customers.controller.ts`) — 4 endpoints — standard CRUD, `customer:*`, tenant-scoped, audited

#### suppliers (`suppliers.controller.ts`) — 4 endpoints — standard CRUD, `supplier:*`, tenant-scoped, audited

#### auth (`auth.controller.ts`) — 7 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| POST | /auth/login | @Public(), Throttle 5/60s | none | LoginDto | N/A (`.raw`, pre-auth) | Y (implicit via loginHistory) | |
| POST | /auth/refresh | @Public(), Throttle 20/60s | none | — (reads cookie) | N/A | — | Rotates refresh token |
| POST | /auth/logout | Y | none (self) | — (reads cookie) | N/A | Y (LOGOUT) | 204 No Content — correct |
| GET | /auth/session | Y | none (self) | — | N/A | — | Returns the `AuthenticatedUser` shape only — no passwordHash/tokens exposed |
| POST | /auth/change-password | Y | none (self) | ChangePasswordDto | N/A | Y | 204 No Content, revokes all refresh tokens — correct |
| POST | /auth/forgot-password | @Public(), Throttle 5/60s | none | ForgotPasswordDto | N/A | — | Enumeration-safe (same response regardless of account existence) |
| POST | /auth/reset-password | @Public(), Throttle 5/60s | none | ResetPasswordDto | N/A | — | |

#### shifts (`shifts.controller.ts`, nested) — 4 endpoints — standard CRUD, `shift:*`, tenant-scoped (create/update not explicitly audited — minor, low-risk config data)

#### machines (`machines.controller.ts`) — 5 endpoints — CRUD + tenant-wide list, `machine:*`, tenant-scoped, audited

#### employees (`employees.controller.ts`) — 5 endpoints — CRUD + tenant-wide list, `employee:*`, tenant-scoped, audited

#### attendance (`attendance.controller.ts`) — 4 endpoints — standard CRUD, `attendance:*`, tenant-scoped (service not read in full detail; DTO validated, `overtimeMinutes` has `@Min(0)`)

#### sales (`sales.controller.ts`) — 4 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| POST | /sales-orders | Y | sales_order:CREATE | CreateSalesOrderDto | Y | Y | Order number via `count()+1` — see API-005 |
| GET | /sales-orders | Y | sales_order:VIEW | ListSalesOrdersQueryDto | Y | — | `orderBy: { [sortBy]: sortOrder }` — see API-010 |
| GET | /sales-orders/:id | Y | sales_order:VIEW | — | Y | — | |
| PATCH | /sales-orders/:id/status | Y | sales_order:APPROVE | UpdateSalesOrderStatusDto | Y | Y | Any status reachable from any status (documented as deferred, D-022) |

#### inventory (`inventory.controller.ts`) — 4 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| GET | /inventory/stock | Y | stock:VIEW | ListStockQueryDto | Y | — | |
| GET | /inventory/movements | Y | stock:VIEW | ListStockQueryDto | Y | — | |
| POST | /inventory/movements | Y | stock:CREATE | RecordMovementDto | Y | **N** | See API-006 — no audit call anywhere in `InventoryService` |
| POST | /inventory/transfer | Y | stock:CREATE | TransferStockDto | Y | **N** | Two unaudited movements; see API-006 |

#### procurement (`procurement.controller.ts`) — 11 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| POST | /purchase-requests | Y | purchase_order:CREATE | CreatePurchaseRequestDto | Y | Y | Number via `count()+1` |
| GET | /purchase-requests | Y | purchase_order:VIEW | PaginationQueryDto | Y | — | |
| GET | /purchase-requests/:id | Y | purchase_order:VIEW | — | Y | — | |
| PATCH | /purchase-requests/:id/status | Y | purchase_order:APPROVE | UpdatePurchaseRequestStatusDto | Y | Y | |
| POST | /purchase-orders | Y | purchase_order:CREATE | CreatePurchaseOrderDto | Y | Y | Number via `count()+1` |
| GET | /purchase-orders | Y | purchase_order:VIEW | PaginationQueryDto | Y | — | |
| GET | /purchase-orders/:id | Y | purchase_order:VIEW | — | Y | — | |
| PATCH | /purchase-orders/:id/status | Y | purchase_order:APPROVE | UpdatePurchaseOrderStatusDto | Y | Y | |
| POST | /goods-receipts | Y | purchase_order:CREATE | CreateGoodsReceiptDto | Y | Y | **No `$transaction`** across receipt+item updates+stock+PO status — see API-001 (P0) |
| GET | /goods-receipts | Y | purchase_order:VIEW | PaginationQueryDto | Y | — | |
| GET | /goods-receipts/:id | Y | purchase_order:VIEW | — | Y | — | |

#### production (`production.controller.ts`) — 12 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| POST | /process-routes | Y | production_order:CREATE | CreateProcessRouteDto | Y | — | Not audited (low risk, config data) |
| GET | /process-routes | Y | production_order:VIEW | — | Y | — | |
| POST | /production-orders | Y | production_order:CREATE | CreateProductionOrderDto | Y | Y | Number via `count()+1` |
| GET | /production-orders | Y | production_order:VIEW | PaginationQueryDto | Y | — | |
| GET | /production-orders/:id | Y | production_order:VIEW | — | Y | — | |
| PATCH | /production-orders/:id/status | Y | production_order:UPDATE | UpdateProductionOrderStatusDto | Y | Y | Uses UPDATE not APPROVE even though this includes RELEASED/COMPLETED transitions — inconsistent with sales/PO/PR which gate status changes behind APPROVE |
| POST | /production-batches | Y | production_batch:CREATE | CreateProductionBatchDto | Y | Y | Number via `count()+1` |
| GET | /production-batches | Y | production_batch:VIEW | PaginationQueryDto | Y | — | |
| GET | /production-batches/:id | Y | production_batch:VIEW | — | Y | — | |
| PATCH | /production-batches/:id/output | Y | production_batch:UPDATE | RecordBatchOutputDto | Y | Y | **No `$transaction`** — batch marked COMPLETED separately from the stock-receipt movement; see API-003 (P1) |
| PATCH | /production-batches/:id/status | Y | production_batch:UPDATE | UpdateBatchStatusDto | Y | **N** | Not audited (status flip to IN_PROGRESS/COMPLETED/HOLD with no trail) |
| POST | /material-consumptions | Y | production_order:CREATE | RecordMaterialConsumptionDto | Y | Y | **No `$transaction`** — consumption row + stock issue are two independent calls; see API-004 (P1). Also: permission is `production_order:CREATE`, an odd resource choice for a materials-consumption action (no `MATERIAL_CONSUMPTION` resource exists in the catalog) |

#### downtime (`downtime.controller.ts`) — 4 endpoints — standard CRUD, `downtime:*`, tenant-scoped, `$transaction`-wrapped create (downtime + machine status, plus auto-created corrective MaintenanceJob outside the transaction — minor: if the MaintenanceJob insert fails after the transaction commits, the breakdown is recorded but no job is opened), audited

#### quality (`quality.controller.ts`) — 5 endpoints — templates + inspections, `quality_inspection:*`, tenant-scoped, inspection create is a single nested-write (atomic) plus one follow-up batch status update outside any transaction (same partial-failure shape as API-003, lower severity since it's a status flag not stock — P2), audited

#### dispatch (`dispatch.controller.ts`) — 3 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| POST | /dispatches | Y | dispatch:CREATE | CreateDispatchDto | Y | Y | **No `$transaction`** across dispatch create + per-item stock ISSUE + sales-order-item delivered-qty + sales-order status; see API-002 (P0) |
| GET | /dispatches | Y | dispatch:VIEW | PaginationQueryDto | Y | — | |
| GET | /dispatches/:id | Y | dispatch:VIEW | — | Y | — | |

#### maintenance (`maintenance.controller.ts`) — 7 endpoints — jobs + schedules, `maintenance_job:*`, tenant-scoped; create/update audited, schedule create/list not audited (low risk)

#### costing (`costing.controller.ts`) — 3 endpoints — cost sheets, `cost_sheet:*`, tenant-scoped, create audited

#### notifications (`notifications.controller.ts`) — 3 endpoints

| Method | Path | Auth | Permission | DTO | Tenant-scoped | Audit | Notes |
|---|---|---|---|---|---|---|---|
| GET | /notifications | Y | none (self) | ListNotificationsQueryDto | **N** (`.raw`, `Notification` IS on the tenant-scoped list) | — | Filtered by `userId` from JWT — not exploitable today (see API-013), but bypasses the safety net |
| PATCH | /notifications/:id/read | Y | none (self) | — | **N** | — | `findFirst({ id, userId })` ownership check present — no IDOR |
| PATCH | /notifications/read-all | Y | none (self) | — | **N** | — | |

#### payroll (`payroll.controller.ts`) — 5 endpoints — periods + entries, `payroll:*`, tenant-scoped (entries via `.raw` upsert, safe — parent period pre-validated, same D-014 pattern as Location), create/status-change audited, `addEntry` not audited (financial data — see API-015)

#### dashboards (`dashboards.controller.ts`) — 6 endpoints — all read-only aggregations, `report:VIEW`, tenant-scoped, no audit needed

**Total: 139 endpoints across 28 controllers.**

---

### 2. Individually-flagged findings

#### [API-001] Goods Receipt creation has no transaction wrapping across four dependent writes
- Severity: P0
- Module: procurement
- File/path: `apps/api/src/procurement/procurement.service.ts` (`createGoodsReceipt`, lines ~181-261)
- Current behavior: `createGoodsReceipt` performs, as separate un-transacted operations: (1) `goodsReceipt.create` (atomic nested write), (2) a per-item loop calling `purchaseOrderItem.update` to increment `receivedQty`/`rejectedQty`, (3) inside that same loop, `inventoryService.recordMovement()` — which opens and commits its *own independent* `$transaction` for the stock ledger + balance — and (4) a final `purchaseOrder.update` to roll the PO status forward. None of steps 1–4 share a transaction.
- Expected behavior: The receipt row, the PO item quantity rollups, the stock movements, and the PO status transition should either all commit or all roll back together (a single `prisma.db.$transaction(async (tx) => {...})` wrapping the whole method, with `InventoryService.recordMovement` accepting an optional `tx` client instead of always opening its own).
- Why it matters: If any item in the loop throws (e.g. a concurrent stock-row lock conflict, a bad materialId, a DB timeout on item 3 of 5), the receipt document and the already-processed items' stock movements are left committed while the remaining items are neither received into stock nor reflected in `receivedQty`, and the PO status update never runs. The PO is now silently "receivable again" for the same physical goods with no record of what was actually accepted, and stock levels understate real inventory. This is exactly the "double-post a Goods Receipt" partial-failure scenario called out for this audit.
- SRS reference: §17.7 (consistent response structures / correct status codes implies atomic mutations); §8.3 ("stock shall never be changed silently").
- Recommended fix: Wrap the full method body in `this.prisma.db.$transaction(async (tx) => {...})`; refactor `InventoryService.recordMovement` to accept an injected Prisma transaction client (or a `tx`-aware variant) so it can participate in the caller's transaction instead of always starting a new one.
- Test required: Integration test that forces the second item's `recordMovement` to throw (e.g. invalid warehouse mid-loop) and asserts the entire receipt, all PO item updates, and all stock movements are rolled back (zero rows created).

#### [API-002] Dispatch creation has no transaction wrapping across stock issue + sales order updates
- Severity: P0
- Module: dispatch
- File/path: `apps/api/src/dispatch/dispatch.service.ts` (`create`, lines ~18-92)
- Current behavior: `dispatch.create` performs an atomic nested-write for the Dispatch+items, then in a loop calls `inventoryService.recordMovement()` (its own separate transaction, type ISSUE) per item, optionally updates `salesOrderItem.deliveredQty`, and finally updates the parent `SalesOrder.status`. None of these later steps share a transaction with the dispatch creation or each other.
- Expected behavior: A single atomic operation — dispatch record, stock issue for every item, delivered-quantity rollup, and sales-order status transition should all commit together.
- Why it matters: A failure partway through the item loop leaves a Dispatch document recorded as issued while some items' stock was never decremented and the sales order's delivered-quantity/status is stale or inconsistent — inventory would show goods as both "in stock" and "dispatched" simultaneously, and the sales order could get stuck never reaching DISPATCHED/COMPLETED. This is the same class of bug as API-001, on the outbound side.
- SRS reference: §8.3, §8.4 (Dispatch), §17.7.
- Recommended fix: Same pattern as API-001 — wrap in `$transaction`, make `InventoryService.recordMovement` transaction-aware.
- Test required: Force a failure on the second dispatch item's stock movement and assert the whole dispatch (and any partial stock/SO updates) rolls back.

#### [API-003] recordBatchOutput marks a batch COMPLETED independently of the stock receipt it triggers
- Severity: P1
- Module: production
- File/path: `apps/api/src/production/production.service.ts` (`recordBatchOutput`, lines ~210-240)
- Current behavior: `productionBatch.update({ status: 'COMPLETED', ... })` runs first and commits; only afterward (and only if `outputWarehouseId` was supplied) does a separate call to `inventoryService.recordMovement()` (its own transaction) receive the output into stock.
- Expected behavior: The batch's completion and its resulting stock receipt should be atomic — either the finished-goods output makes it into stock and the batch is marked COMPLETED, or neither happens.
- Why it matters: If `recordMovement` throws (bad warehouse, DB error) after the batch update commits, the system shows the batch as COMPLETED with recorded `outputQuantity` but the output was never received into any warehouse — invisible, unrecoverable-without-manual-intervention inventory loss that looks like "production happened" on every downstream report (costing, dashboards) while stock records disagree.
- SRS reference: §7.1, §7.4, §8.3.
- Recommended fix: Wrap the batch update and the conditional stock receipt in one `$transaction`.
- Test required: Force the stock-receipt call to fail and assert the batch status update also rolls back (batch remains IN_PROGRESS).

#### [API-004] recordConsumption creates a MaterialConsumption row independently of the stock issue it represents
- Severity: P1
- Module: production
- File/path: `apps/api/src/production/production.service.ts` (`recordConsumption`, lines ~250-283)
- Current behavior: `materialConsumption.create` commits first; the corresponding `inventoryService.recordMovement()` (CONSUMPTION, separate transaction) runs after.
- Expected behavior: Both writes atomic.
- Why it matters: A failure after the consumption row commits leaves a "material was consumed" record with no matching stock deduction — inflates apparent on-hand material while the system believes it was used, corrupting reorder-level calculations and costing.
- SRS reference: §7.1, §8.3.
- Recommended fix: Same `$transaction` pattern as API-001/002/003.
- Test required: Force the stock movement to fail and assert the MaterialConsumption row is also rolled back.

#### [API-005] No idempotency/duplicate-submission protection on document-creating endpoints
- Severity: P1
- Module: sales, procurement, production, dispatch, quality (all `create*` endpoints that mint a document number)
- File/path: `sales.service.ts:generateOrderNumber`, `procurement.service.ts` (PR/PO/GR number generation), `production.service.ts` (PRO/BATCH number generation), `dispatch.service.ts` (DSP number), `quality.service.ts` (QI number), `downtime.service.ts` (MJ number) — all use the same `` `PREFIX-${String((await model.count()) + 1).padStart(6, '0')}` `` pattern
- Current behavior: Document numbers are derived from a live `count()` at request time with no idempotency key, no client-supplied request ID, and no application-level duplicate check (e.g. "same customer + same items + same user within N seconds"). The `@@unique([tenantId, orderNumber])`-style DB constraint (confirmed in `schema.prisma`) prevents two *concurrent* requests from silently landing on the same number, but it does nothing for a **sequential** double-submit (e.g. a user double-clicking "Create Order" on a slow connection, or a client retry after a timed-out-but-actually-succeeded request) — each attempt gets its own, valid, incrementing number and creates a fully separate Sales Order / Purchase Order / Goods Receipt / Dispatch / Production Batch.
- Expected behavior: A create endpoint for a business document should accept (or generate and echo back) an idempotency key, or perform a short-window duplicate check on (tenant, actor, same logical content) before persisting, so a slow-network retry cannot mint two orders for one user action.
- Why it matters: This is explicitly called out in the audit brief as the "double-submit creates two Sales Orders / double-posts a Goods Receipt" risk. A duplicated Goods Receipt double-counts received inventory; a duplicated Dispatch double-issues stock the warehouse never actually shipped twice; a duplicated Sales/Purchase Order creates phantom financial commitments.
- SRS reference: §17.7 (consistent, correct API behavior); §18 ("Offline Testing... duplicate transactions" is explicitly listed as a required test focus, implying the requirement is intended to exist).
- Recommended fix: Add an `Idempotency-Key` header (or a client-generated UUID field in the DTO) that the service checks against a short-lived cache/unique index before creating; alternatively, add a database-level near-duplicate guard (e.g. reject a second GoodsReceipt against the same PO+items within a short window without an explicit override) for the highest-risk endpoints (Goods Receipts, Dispatches, Sales/Purchase Orders).
- Test required: Fire two identical `POST /sales-orders` (or /goods-receipts, /dispatches) requests back-to-back with the same idempotency key and assert only one record is created; without a key, document current (accepted) dual-creation behavior in a regression test so any future fix is verifiably closing the gap.

#### [API-006] Manual stock-movement endpoints are never audit-logged
- Severity: P1
- Module: inventory
- File/path: `apps/api/src/inventory/inventory.service.ts` (entire file — no `AuditService` import, no constructor dependency, no `.log()` call anywhere)
- Current behavior: `POST /inventory/movements` and `POST /inventory/transfer` (both mutating, `stock:CREATE`-gated) write `StockMovement` + `Stock` rows but never call `AuditService.log()`. This applies to every caller of `InventoryService.recordMovement`, including the two endpoints directly exposed on `InventoryController` — the manual "Record Movement" and "Transfer Stock" actions a warehouse user can invoke directly (RECEIVE / ISSUE / ADJUSTMENT / RETURN / TRANSFER), which are exactly the movements *not* originating from a Goods Receipt / Production output / Dispatch (those get an audit entry for their own parent document, e.g. "GoodsReceipt CREATE" — but the underlying stock delta itself is still not logged anywhere by inventory).
- Expected behavior: Per the module's own doc comment ("stock shall never be changed silently" — SRS §8.3) and SRS §15.2 (audit log must cover create/update/delete of significant business records), every manual stock adjustment should produce an audit trail entry, since these are the *un-derived*, directly-operator-entered movements most likely to need traceability (shrinkage write-offs, damage corrections, ad-hoc transfers).
- SRS reference: §8.3, §15.2.
- Recommended fix: Inject `AuditService` into `InventoryService` and log a `CREATE` (or a dedicated `STOCK_ADJUSTMENT`) entry inside `recordMovement`, capturing `type`, `quantity`, `warehouseId`, and the resulting balance.
- Test required: Call `POST /inventory/movements` with type ADJUSTMENT and assert an `AuditLog` row is created with matching `entityType`/`entityId`/`newValue`.

#### [API-007] `.raw` (tenant-scoping bypass) used outside its documented platform-admin scope
- Severity: P2
- Module: roles, notifications
- File/path: `apps/api/src/roles/roles.service.ts` (`setRolePermissions`, lines 42-47: `this.prisma.raw.$transaction([permission.deleteMany, permission.createMany])`); `apps/api/src/notifications/notifications.service.ts` (all four methods use `this.prisma.raw.notification.*`, even though `Notification` is listed in `TENANT_SCOPED_MODELS`)
- Current behavior: `PrismaService`'s own docstring states: *"Inject `PrismaService` (not `PrismaClient` directly) everywhere in application code; `.raw` is reserved for platform-level code (the tenants module) that legitimately needs cross-tenant access."* `roles.service.ts` and `notifications.service.ts` are ordinary tenant-application code, not platform code, yet both bypass the tenant-scoping Prisma extension entirely.
- Expected behavior: Both should use `prisma.db` (tenant-scoped) wherever the underlying model participates in `TENANT_SCOPED_MODELS`. `Permission` is not itself tenant-scoped (correctly, per D-014 — it's a child of `Role`), so `roles.service.ts`'s use of `.raw` for the `Permission` delete/create is not currently exploitable — the parent `roleId` was already confirmed to belong to the caller's tenant via a preceding `this.getRoleById(id)` call on `.db` — but it is inconsistent with the codebase's stated invariant and removes the extension's built-in `ForbiddenException` safety net for a future refactor that reorders these calls. `notifications.service.ts` is a stronger case: `Notification` **is** in `TENANT_SCOPED_MODELS`, so every query there deliberately routes around the guard that would otherwise throw if `TenantContextStore` had no tenant. Currently safe only because every call is additionally filtered by `userId` sourced from the caller's own JWT — but the `notify()` producer method takes an arbitrary `userId: string` parameter with no verification that the target user belongs to the current tenant context, and it is documented as "the hook other modules will call as their triggers are built" — i.e. it's about to get more callers.
- Why it matters: The single biggest structural protection against cross-tenant data leaks in this codebase is "always go through `.db`." Two modules already deviate from it in ordinary request-handling code paths, which is exactly the kind of drift that turns into a real cross-tenant bug once a future PR adds a new caller (e.g. an admin "send notification to any user" feature built by copy-pasting `notify()`) without re-deriving the tenant check that `.db` would have provided for free.
- SRS reference: §22 (cross-tenant isolation — referenced directly by `PermissionsGuard`'s own docstring); §17.7.
- Recommended fix: Switch both to `prisma.db`. For `roles.service.ts`, this requires no other change since `Permission` isn't tenant-scoped, so `.db` and `.raw` behave identically here — do it purely for convention/consistency and future-proofing. For `notifications.service.ts`, switching to `.db` will start enforcing tenant scoping automatically because `Notification` carries a `tenantId` column; additionally, have `notify()` validate that `input.userId` resolves to a user in the current tenant context before writing.
- Test required: Unit test asserting `NotificationsService.notify()` throws (or is otherwise blocked) when called with a `userId` belonging to a different tenant than the current `TenantContextStore` context.

#### [API-008] Several numeric DTO fields accept negative/zero values that don't make business sense
- Severity: P2
- Module: maintenance, quality
- File/path: `apps/api/src/maintenance/dto/maintenance-job.dto.ts` — `CreateMaintenanceScheduleDto.frequencyDays` (`@IsNumber()` only, no `@Min`/`@IsPositive`) and `UpdateMaintenanceJobDto.cost` (`@IsOptional() @IsNumber()`, no `@Min(0)`); `apps/api/src/quality/dto/quality-inspection.dto.ts` — `DefectInputDto.quantity` (`@IsOptional() @IsNumber()`, no `@Min(0)`)
- Current behavior: A maintenance schedule can be created with `frequencyDays: 0` or negative, which would either divide-by-zero or produce a nonsensical "due" calculation downstream; a maintenance job can be closed with a negative `cost`; a quality defect can be recorded with a negative `quantity`.
- Expected behavior: `frequencyDays` should require `@IsInt() @Min(1)`; `cost` should require `@Min(0)`; `DefectInputDto.quantity` should require `@Min(0)`.
- Why it matters: These feed cost totals (maintenance cost rollups) and quality/defect-rate reporting (dashboards §12) — a negative value silently corrupts an aggregate rather than being rejected at the API boundary, which is exactly the class of gap SRS §17.7's "validate all request DTOs" is meant to prevent.
- SRS reference: §17.7, §9.3, §11.
- Recommended fix: Add the missing `@Min`/`@IsPositive` decorators listed above.
- Test required: `class-validator` unit tests (or e2e) asserting `frequencyDays: -1`, `cost: -100`, and `defects[0].quantity: -5` are all rejected with 400.

#### [API-009] Sales/Purchase order line-item discount is not bounded against the line total
- Severity: P2
- Module: sales, procurement (goods-receipt implicitly related — see acceptedQty/rejectedQty note below)
- File/path: `apps/api/src/sales/dto/create-sales-order.dto.ts` (`CreateSalesOrderItemDto.discount`, `@IsOptional() @IsNumber() @Min(0)` — lower-bounded only)
- Current behavior: `lineTotal = quantity * unitPrice - discount` is computed in `sales.service.ts` with no check that `discount <= quantity * unitPrice`. A discount larger than the line subtotal is accepted and silently produces a negative `lineTotal`, which flows into a negative `subtotal`/`total` on the order.
- Expected behavior: Either a `@ValidateIf`/custom validator rejecting `discount > quantity * unitPrice`, or a service-level check that clamps/rejects it before persisting.
- Why it matters: A negative order total is a data-integrity problem that will surface downstream in costing/reporting/dashboards with no clear origin, and is trivially reachable by a typo (extra zero) in the discount field with no server-side guard.
- SRS reference: §6.1, §17.7.
- Recommended fix: Add cross-field validation in the DTO (custom `@Validate` decorator) or a guard in `SalesService.createOrder` that throws `BadRequestException` when any item's discount exceeds its subtotal.
- Test required: `POST /sales-orders` with an item where `discount > quantity*unitPrice` should return 400, not 201 with a negative total.

#### [API-010] Unvalidated free-text `sortBy` passed directly into Prisma `orderBy`
- Severity: P3
- Module: sales
- File/path: `apps/api/src/sales/sales.service.ts` (`list`, line 104: `orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder }`)
- Current behavior: `sortBy` comes from `PaginationQueryDto` as a bare `@IsString()` with no whitelist of allowed column names. Any string is accepted by the DTO layer and passed straight into Prisma's `orderBy`.
- Expected behavior: `sortBy` should be validated against an enum of actually-sortable columns for this resource (e.g. `orderNumber | total | createdAt | status`).
- Why it matters: An invalid or relational field name (e.g. `sortBy=customer.name` or a typo) throws inside Prisma and is caught by `AllExceptionsFilter` as an unhandled 500 rather than a clean 400 — inconsistent HTTP semantics for a client-input error, and a minor amplification/error-oracle surface. Not exploitable for data leakage (Prisma doesn't support arbitrary expression injection through `orderBy` keys), just a robustness/status-code gap.
- SRS reference: §17.7 ("correct HTTP status codes").
- Recommended fix: Replace `@IsString() sortBy?: string` with `@IsIn([...])` per resource, or centrally validate against the model's known scalar fields before building `orderBy`.
- Test required: `GET /sales-orders?sortBy=not_a_real_column` should return 400.

#### [API-011] No dedicated rate limiting on aggregation-heavy dashboard endpoints
- Severity: P3
- Module: dashboards
- File/path: `apps/api/src/dashboards/dashboards.controller.ts` (all 6 routes); compare `apps/api/src/app.module.ts` (`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`, applied globally with no per-route override here)
- Current behavior: The six dashboard endpoints (owner/production/machines/inventory/quality/maintenance) each run multi-table aggregation queries and rely solely on the blanket 100 req/min default, same as a simple `GET /factories/:id`.
- Expected behavior: Heavier aggregate/report endpoints typically warrant a tighter per-route `@Throttle` (or caching) given their relative DB cost, consistent with how `auth.controller.ts` already tightens limits for its sensitive routes.
- Why it matters: Low likelihood of exploitation today (no true bulk-export endpoint exists yet in this build — `Action.EXPORT`/`Action.PRINT` are defined in the RBAC catalog but no controller currently exposes an export/print route), but flagged because the audit brief specifically calls out checking rate limits on "expensive... endpoints," and this is the one class of endpoint in the current surface that is meaningfully more expensive than the rest without any differentiated protection.
- SRS reference: §17.7 (implicit), §16 (performance under load, referenced generally).
- Recommended fix: Add a moderate `@Throttle` override (e.g. 20-30/min) to `DashboardsController` routes; revisit once actual export/bulk endpoints are built.
- Test required: N/A / informational — revisit if/when export endpoints are added.

#### [API-012] Production order status transition uses `UPDATE` action, not `APPROVE`, unlike its sibling workflows
- Severity: P3
- Module: production
- File/path: `apps/api/src/production/production.controller.ts` (`updateOrderStatus`, `@RequirePermission(Resource.PRODUCTION_ORDER, Action.UPDATE)`)
- Current behavior: Sales Order, Purchase Order, and Purchase Request status changes are all gated behind `Action.APPROVE` (a stricter permission bucket per the RBAC catalog's `APPROVAL` action set), but Production Order status changes — which include moving to `RELEASED` and `COMPLETED`, i.e. releasing work to the floor — are gated behind the more broadly-granted `Action.UPDATE`.
- Expected behavior: For consistency with the other three approval-style workflows in the same codebase, releasing/completing a production order should likely require `Action.APPROVE` (or the RBAC catalog should document why production-order status is intentionally looser).
- Why it matters: Roles granted `PRODUCTION_ORDER: STANDARD` (VIEW/CREATE/UPDATE/EXPORT/PRINT, no APPROVE) — e.g. `PRODUCTION_SUPERVISOR` only has `VIEW` on `PRODUCTION_ORDER` so is unaffected, but `PRODUCTION_MANAGER`'s `STANDARD_WITH_DELETE` includes UPDATE without needing APPROVE, meaning this is likely intentional (managers can move their own orders through the pipeline without an extra approval step) — flagging as a **design consistency note**, not a confirmed bug, since it may be deliberate given production workflows differ from commercial-approval workflows.
- SRS reference: §7.3, §4.2.
- Recommended fix: Confirm with product owner whether this is intentional; if not, change to `Action.APPROVE` for the `RELEASED`→ and →`COMPLETED` transitions specifically (may require splitting the single status endpoint by transition).
- Test required: N/A pending product decision.

#### [API-013] `notify()` accepts an arbitrary `userId` with no tenant-membership check (see also API-007)
- Severity: P2
- Module: notifications
- File/path: `apps/api/src/notifications/notifications.service.ts` (`notify`, lines 29-43)
- Current behavior: `notify({ userId, ... })` writes a `Notification` row for the given `userId` using `tenantId: ctx?.tenantId ?? null` (the *caller's* tenant, not a tenant derived from or validated against the target user). No current controller calls `notify()` directly (per the class's own doc comment, "none of those triggers are wired up yet"), so this isn't reachable through the HTTP surface today.
- Expected behavior: `notify()` should verify the target `userId` belongs to the tenant in `TenantContextStore` (or the notification's tenantId should be derived from the target user's own tenant record, not the caller's context) before writing.
- Why it matters: This is a landmine for the next PR that wires up a trigger (low stock, production delay, etc.) — if any future caller passes a `userId` sourced from unchecked input (e.g. an "assign to user" field elsewhere) rather than always from `TenantContextStore`, a cross-tenant notification write becomes possible with today's code as-is.
- SRS reference: §22, §12.7.
- Recommended fix: Add a tenant-membership assertion inside `notify()` itself (defense in depth, independent of switching to `.db` in API-007).
- Test required: Unit test asserting `notify({ userId: <other-tenant-user> })` throws under the current tenant's context.

#### [API-014] Swagger/OpenAPI is wired but undocumented at the route level
- Severity: P3
- Module: (all 28 controllers)
- File/path: `apps/api/src/main.ts` (SwaggerModule setup, lines 36-45); none of the 28 `*.controller.ts` files use `@ApiTags`, `@ApiOperation`, `@ApiResponse`, or `@ApiBearerAuth`
- Current behavior: `SwaggerModule.setup('api/docs', ...)` is real and gated correctly to non-production, and `DocumentBuilder().addBearerAuth()` registers a global security scheme — but with zero `@ApiBearerAuth()` decorators on individual controllers/routes, the generated Swagger UI won't show the lock icon or require auth-testing per-route, and with zero `@ApiTags`/`@ApiOperation`, the doc is just an auto-derived list of routes/DTO shapes with no human-readable grouping or descriptions.
- Expected behavior: SRS §17.7 says APIs "shall be... documented using Swagger/OpenAPI" — the mechanism is present and functional, but the documentation quality is minimal (types only, no descriptions/grouping/security annotations).
- Why it matters: Lower severity because the requirement's literal bar (a working Swagger/OpenAPI document exists) is met; this is a documentation-completeness gap, not a missing capability.
- SRS reference: §17.7.
- Recommended fix: Add `@ApiTags(<module>)` per controller and `@ApiBearerAuth()` either globally (`DocumentBuilder` supports applying it as a default per-operation requirement via `.addBearerAuth()` + a global `@ApiBearerAuth()` on a base decorator, or per-controller) plus `@ApiOperation({ summary })` on at least the mutating endpoints.
- Test required: N/A (documentation task) — could add a lint rule/CI check that flags new controllers lacking `@ApiTags`.

#### [API-015] Payroll entry addition (`addEntry`) is not audit-logged
- Severity: P2
- Module: payroll
- File/path: `apps/api/src/payroll/payroll.service.ts` (`addEntry`, lines 60-75)
- Current behavior: `addEntry` upserts a `PayrollEntry` (base salary, overtime, incentive, deductions, net amount — all direct financial figures) with no call to `AuditService.log()`. By contrast, `updateStatus` on the same controller (approving/paying a period) is audited.
- Expected behavior: Creating/editing the actual salary figures that make up a payroll period should be logged per SRS §15.2 the same way the period-level status change already is.
- Why it matters: Payroll figures are among the most sensitive data in the system; the fact that entries can be silently edited (the upsert allows re-submitting the same employee+period to overwrite prior figures) while only in DRAFT status, with zero audit trail of what the previous values were, undermines traceability for exactly the kind of record that most needs it.
- SRS reference: §10.3, §15.2.
- Recommended fix: Add `this.auditService.log({ action: 'CREATE' | 'UPDATE', entityType: 'PayrollEntry', entityId, oldValue, newValue })` inside `addEntry`, capturing old values on the upsert-update path.
- Test required: `POST /payroll-periods/:id/entries` twice for the same employee (create then overwrite) and assert two distinct audit entries with correct old/new values.

---

### 3. Summary

- **Total endpoints enumerated: 139**, across 28 controllers.
- **"Authenticated but no permission check on a mutation" pattern: 0 endpoints.** Every mutating endpoint in the 28 controllers is gated by either `@RequirePermission(...)` or `PlatformAdminGuard` (tenant provisioning routes), with the sole exceptions being genuinely self-scoped actions that operate only on the caller's own record and correctly need no resource permission: `POST /auth/logout`, `POST /auth/change-password`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`, `PATCH /users/:id` is *not* in this list (it does require `user:UPDATE`) — this specific class of bug, which the audit was primarily hunting for, was **not found**; RBAC coverage is comprehensive and consistent with the recent D-025 fix referenced in the repo's commit history.
- **Findings by severity**: P0 = 2 (API-001, API-002), P1 = 3 (API-003, API-004, API-005) plus API-006 (P1), P2 = 5 (API-007, API-008, API-009, API-013, API-015), P3 = 4 (API-010, API-011, API-012, API-014).
  - Total: **15 individually-flagged findings** (2 P0, 4 P1, 5 P2, 4 P3).
- **By category**:
  - Missing transaction wrapping on multi-write mutations: 4 endpoints directly flagged (API-001 Goods Receipt, API-002 Dispatch, API-003 Batch Output, API-004 Material Consumption), plus 2 more noted inline in the table as lower-severity variants of the same shape (Downtime's auto-created MaintenanceJob outside its transaction; Quality Inspection's batch-status follow-up outside its transaction).
  - Duplicate-submission / idempotency gaps: systemic, 1 finding (API-005) covering 6+ document-creating endpoints across 5 modules.
  - Audit-logging gaps on mutating endpoints: 3 endpoints (API-006's two inventory endpoints, plus API-015's payroll entry endpoint), plus several lower-risk unaudited config-mutation endpoints noted inline (warehouse locations, shift create/update, process routes, maintenance schedules, production batch status).
  - Tenant-scoping bypass (`.raw` outside platform-admin code): 2 modules (API-007 roles, API-013 notifications) — neither currently exploitable through the live API surface, both flagged as structural risk.
  - DTO under-validation: 2 findings (API-008 missing lower bounds, API-009 missing cross-field discount bound).
  - HTTP-semantics / consistency: 2 findings (API-010 unvalidated sort column surfacing as 500, API-012 inconsistent APPROVE-vs-UPDATE gating — the latter flagged as a design question, not a confirmed defect).
  - Rate limiting: 1 informational finding (API-011) — no true bulk-export endpoints exist yet in this build, so no active over-permissive-throttling defect was found.
  - Over-exposure of sensitive fields: **none found** — `passwordHash` and refresh-token hashes are never returned by any endpoint (verified `USER_LIST_SELECT`, `AuthService.toPublicUser`, and `JwtStrategy.validate`'s `AuthenticatedUser` shape all explicitly exclude them); `GET /auth/session` and `GET /users/me` both return shaped objects, not raw Prisma entities.

---

## 13. Authentication Audit

*(Findings AUTH-001 through AUTH-006, from the dedicated Multi-Tenancy/RBAC/Auth Audit stream. The Findings Index table below covers all of Sections 8, 9, and 13.)*

## PART C — Authentication Audit

#### [AUTH-001] No refresh-token-family revocation on reuse detection
- Severity: P2
- Module: Auth
- File/path: `apps/api/src/auth/auth.service.ts:66-79` (`refresh`)
- Current behavior: Refresh tokens rotate correctly on use (old token's `revokedAt` is set, a new pair issued), and replaying an already-revoked token is correctly rejected (`if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw new UnauthorizedException(...)`). However, detecting that specific condition — a revoked token being presented again, which is the textbook signal of token theft (attacker and legitimate user both racing to use a stolen token) — does nothing beyond rejecting that one request. It does not revoke the rest of that user's active refresh tokens/sessions.
- Expected behavior: On detecting reuse of a revoked token, the system should treat it as a compromise signal and revoke every other active `RefreshToken` for that `userId` (forcing full re-authentication), not just reject the single replayed request.
- Why it matters: Without family-wide revocation, if an attacker steals a refresh token and the legitimate user's client already rotated past it, the attacker's request is correctly rejected — but if the attacker was first, the legitimate user's rotated (now-current) token is what's active, and *that* session persists undetected. Reuse detection without a revocation response only degrades to "log and hope," not "contain."
- SRS reference: §5.1 Session Management; §16.1 Security Requirements.
- Recommended fix: In `refresh()`, when `stored.revokedAt` is set (reuse of an already-rotated token), revoke all of that user's non-revoked `RefreshToken` rows in the same transaction before throwing, and consider logging a security event.
- Test required: `AUTH-TEST-1` below.

```gherkin
Scenario: AUTH-TEST-1 — Refresh token reuse revokes the whole session family
  Given User A logs in and receives refresh token T1
  And User A calls POST /auth/refresh with T1, receiving rotated token T2 (T1 is now revoked)
  When an attacker replays T1 at POST /auth/refresh
  Then the response must be 401
  And T2 must also now be revoked (a subsequent POST /auth/refresh with T2 must also 401)
  And User A must be required to log in again
```

#### [AUTH-002] Login has a timing side-channel that can enumerate account existence
- Severity: P3
- Module: Auth
- File/path: `apps/api/src/auth/auth.service.ts:34-42` (`login`)
- Current behavior: For a nonexistent email, `login()` returns immediately after a single `findUnique` (`if (!user || user.deletedAt) throw invalidCredentials()`). For an existing email, it additionally runs `argon2.verify(...)`, which is deliberately slow (argon2id, tuned for password hashing). The response is identical (`"Invalid email or password"`) in both cases, but the response **time** differs measurably, allowing an attacker to distinguish "no such account" from "wrong password" by timing alone. Contrast with `forgotPassword()`, which explicitly documents and implements uniform behavior specifically to avoid this exact issue ("Always behave the same whether or not the account exists — prevents user enumeration via response timing/content").
- Expected behavior: `login()` should perform an equivalent-cost dummy hash verification (against a fixed/precomputed hash) when the user doesn't exist, so response time is statistically indistinguishable.
- Why it matters: Minor but genuine — enables targeted account enumeration, useful groundwork for a subsequent credential-stuffing or phishing campaign against confirmed real accounts.
- SRS reference: §16.1 Security Requirements.
- Recommended fix: Add a constant-cost dummy `verifyPassword` call on the not-found path, mirroring `forgotPassword`'s approach.
- Test required: Timing-based test (or code-review-level check) confirming both paths perform one argon2 verify operation.

#### [AUTH-003] No automated account lockout after repeated failed login attempts
- Severity: P3
- Module: Auth
- File/path: `apps/api/src/auth/auth.service.ts:34-64` (`login`); `UserStatus` enum in `prisma/schema.prisma` includes `LOCKED` but nothing transitions a user into it automatically.
- Current behavior: Failed logins are correctly recorded in `LoginHistory` (`success: false`), and `@Throttle({ limit: 5, ttl: 60_000 })` rate-limits the `/auth/login` endpoint globally by IP. But there is no logic anywhere that counts consecutive failures for a given account and locks it — a distributed/slow-rate attacker (e.g. 4 attempts/minute from many IPs, or spread over hours) is not rate-limited meaningfully and never trips the `LOCKED` status the schema already models.
- Expected behavior: SRS §5.1 lists "Account activation / deactivation" among required auth capabilities, and the schema anticipates lockout (`LOCKED` status exists); a reasonable MVP control would lock an account after N consecutive failures within a window, requiring admin unlock or a cooldown.
- Why it matters: IP-based throttling alone is a weak brute-force control for a determined or distributed attacker; per-account lockout is the standard complementary control and the schema already has the field for it, sitting unused.
- SRS reference: §5.1 Authentication & User Management; §16.1.
- Recommended fix: Track consecutive failed attempts (e.g. a counter column or a windowed `LoginHistory` count query) and set `status: 'LOCKED'` after a threshold, with either a time-based auto-unlock or admin-only unlock via the existing `PATCH /users/:id` status endpoint.
- Test required: 10 consecutive failed logins for one account from varying IPs → account status becomes `LOCKED`; subsequent correct-password login is rejected with a clear "account locked" message.

#### [AUTH-004] `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN` are validated at boot but entirely unused (dead configuration)
- Severity: P4 (hygiene, no direct security impact)
- Module: Auth
- File/path: `apps/api/src/config/env.validation.ts:19-20`, `apps/api/src/config/configuration.ts:20-21`
- Current behavior: These two env vars are required (min-32-char secret, enforced at boot via zod) and wired into `AppConfig.jwt.refreshSecret`/`refreshExpiresIn`, but refresh tokens are actually opaque random tokens (`generateOpaqueToken()` in `password.util.ts`), not signed JWTs — `refreshSecret`/`refreshExpiresIn` are never referenced anywhere in `auth.service.ts` or elsewhere.
- Expected behavior: Either remove the dead config, or (if a future refactor intends to make refresh tokens JWTs) leave a comment explaining the config exists for that future use.
- Why it matters: Not a vulnerability, but dead security-relevant config is exactly the kind of thing that causes confusion during a future audit or incident response ("is the refresh token secret rotated? which one?").
- SRS reference: §16.1 (secure environment-variable management — tangential).
- Recommended fix: Remove `JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRES_IN` from `env.validation.ts`/`configuration.ts`, or document their intended future use.
- Test required: None (cleanup item).

#### [AUTH-005] Confirmed correct: JWT payload contains no sensitive/over-included claims
- Severity: N/A — verified control
- Module: Auth
- File/path: `apps/api/src/auth/strategies/jwt.strategy.ts:8-11`, `apps/api/src/auth/auth.service.ts:156-163`
- Current behavior: The access-token payload is exactly `{ sub: userId, tokenType: 'access' }`. No `tenantId`, `role`, `permissions`, or `email` are embedded. `JwtStrategy.validate()` re-fetches the user, their roles/permissions, and factory access fresh from the database on every request specifically so a deactivated/edited account or changed permissions take effect within one token lifetime (15m default) rather than being cached in a long-lived, base64-decodable token.
- Why it matters: Directly answers Part C item 2's "over-inclusion" concern — there is none. This is also a stronger design than embedding claims, since JWTs are base64 (not encrypted) and visible to anyone holding the token.
- SRS reference: §16.1.
- Recommended fix: None — confirmed correct. Worth noting the tradeoff (a DB round-trip on every authenticated request) is a deliberate, documented choice, not an oversight.
- Test required: None; verified by code inspection.

#### [AUTH-006] Confirmed correct: rate limiting is specifically tightened on auth endpoints, not just a permissive global default
- Severity: N/A — verified control
- Module: Auth
- File/path: `apps/api/src/app.module.ts:54,94` (global default), `apps/api/src/auth/auth.controller.ts:25,37,77,85` (`@Throttle` overrides)
- Current behavior: Global default is 100 requests/60s per client (reasonable for general API use). `login`, `forgot-password`, and `reset-password` are all overridden to 5/60s; `refresh` is overridden to 20/60s (looser, appropriate since it's called automatically by the frontend's silent-refresh logic, not attacker-relevant in the same way).
- Why it matters: Directly answers Part C item 5 — confirmed brute-force-relevant endpoints get meaningfully stricter limits than the general API surface, not just the global default.
- SRS reference: §16.1.
- Recommended fix: None — confirmed correct. (See AUTH-003 for the complementary per-account-lockout gap this doesn't fully close on its own.)
- Test required: None; verified by code inspection.

---

### Findings Index

| ID | Title | Severity | Module |
|---|---|---|---|
| TEN-001 | Quality Dashboard aggregates defect data across all tenants | P0 | Multi-Tenancy |
| TEN-002 | Cross-tenant user-existence enumeration via invite-user email check | P2 | Multi-Tenancy |
| TEN-003 | NotificationsService bypasses tenant-scoping extension entirely | P2 | Multi-Tenancy |
| TEN-004 | `.raw` escape-hatch used without structural regression protection | P3 | Multi-Tenancy |
| TEN-005 | (verified) Extension prevents IDOR-by-ID-guessing, not just cross-tenant LIST | — | Multi-Tenancy |
| TEN-006 | (verified) Tenant context interceptor covers the full downstream chain | — | Multi-Tenancy |
| RBAC-001 | Factory-level access computed but never enforced by any backend service | P0 | RBAC |
| RBAC-002 | Export/Print actions modeled and granted but never enforced anywhere | P1 | RBAC |
| RBAC-003 | Frontend has no factory-level gating (mirrors backend gap) | P3 | RBAC |
| RBAC-004 | (verified) Company Owner role-edit lock enforced server-side | — | RBAC |
| RBAC-005 | (verified) Every mutating endpoint reviewed has permission/guard enforcement | — | RBAC |
| AUTH-001 | No refresh-token-family revocation on reuse detection | P2 | Auth |
| AUTH-002 | Login has a timing side-channel enabling account enumeration | P3 | Auth |
| AUTH-003 | No automated account lockout after repeated failed logins | P3 | Auth |
| AUTH-004 | Dead `JWT_REFRESH_SECRET`/`JWT_REFRESH_EXPIRES_IN` config | P4 | Auth |
| AUTH-005 | (verified) JWT payload has no over-included sensitive claims | — | Auth |
| AUTH-006 | (verified) Rate limiting correctly tightened on auth endpoints | — | Auth |

---

## 14. Worker/BullMQ Audit

*(Findings WRK-001 through WRK-006, from the dedicated Worker/Production-Readiness Audit stream.)*

### Part A — Worker / BullMQ Audit

#### [WRK-001] `apps/worker` is a completely empty scaffold — zero implementation
- Severity: P1
- Module: Worker
- File/path: `apps/worker/` (contains only an empty `src/` directory; no `package.json`, no `.ts` files of any kind — confirmed via full recursive listing)
- Current behavior: The directory exists per the repo structure (SRS §19's recommended layout) but has no code, no dependencies, and cannot be built or run. It is not a workspace member in any functional sense (no `package.json` for npm workspaces to pick up).
- Expected behavior: Per SRS §3.1's architecture diagram (`PostgreSQL → Redis/BullMQ → Background Workers` shown as a first-class platform component) and §16.2 ("Large reports shall be processed through background jobs... Redis shall be used for appropriate caching and queueing"), a working worker process should exist that connects to Redis, defines at least the queue/processor scaffolding, and is wired into `apps/api` as a producer.
- Why it matters: this isn't a bug — it's 0% of a named architectural component. Every "should this be async" question below (email, notifications, future reports/exports) currently has no destination to be moved to. This is a real, sizeable, not-yet-started piece of MVP-adjacent infrastructure, and should be sized and scheduled explicitly rather than assumed to be "mostly done" because the directory exists.
- SRS reference: §3.1, §16.2, §17.5, §19, §23 (final stack table lists BullMQ/Queue as a delivered layer)
- Recommended fix: Scaffold `apps/worker` as a minimal NestJS (or plain BullMQ) process with `@nestjs/bullmq`, a Redis connection using the same `REDIS_URL` config pattern as the API, and a first real processor (email sending is the natural first candidate — see WRK-002) to prove the pattern end-to-end, including the tenant-context re-establishment pattern in WRK-005.
- Test required: once implemented — an integration test that enqueues a job from the API, confirms the worker process picks it up, processes it, and the expected side effect (e.g. an email actually attempted) occurs; a failure-and-retry test; a test that a malformed/missing job payload doesn't crash the worker process itself (only fails that job).

#### [WRK-002] Password-reset and invite/welcome emails are sent synchronously, inline in the HTTP request
- Severity: P2
- Module: Worker (async-work candidate) / Auth / Tenants / Users
- File/path: `apps/api/src/auth/auth.service.ts:125` (`await this.mailService.sendPasswordReset(...)`), `apps/api/src/tenants/tenants.service.ts:70` (`await this.mailService.sendWelcome(...)`), `apps/api/src/users/users.service.ts:71` (`await this.mailService.sendWelcome(...)`)
- Current behavior: all three call sites `await` `MailService.send()` directly inside the request-handling method. In dev (no `SMTP_HOST` configured) this is just a synchronous log call and effectively free; in production, with a real SMTP transport configured, this makes `POST /auth/forgot-password`, tenant provisioning, and user invite all block the HTTP response on a live SMTP round-trip, and any error thrown by `nodemailer.sendMail` (timeout, auth failure, provider outage) will surface as a failure of the *entire* request — e.g. inviting a user or provisioning a tenant would fail outright if the mail provider has a transient issue, even though the underlying business record (`User`, `Tenant`) was already created.
- Expected behavior: these should be fire-and-forget from the caller's perspective — enqueue a `send-email` job and return immediately; the worker retries independently of the original request's lifecycle. A transient SMTP failure should not roll back or fail a tenant-provisioning or user-invite request that otherwise succeeded.
- Why it matters: per SRS §16.2's explicit background-job requirement, and because right now a flaky mail provider is a single point of failure for three distinct, business-critical flows (password reset, tenant onboarding, user invitation) that have nothing to do with email delivery semantically.
- SRS reference: §16.2, §3.1
- Recommended fix: once `apps/worker` exists (WRK-001), move `MailService.send()` calls behind a BullMQ producer (`mailQueue.add('send', { to, subject, html, text })`) in the three call sites above; keep `MailService` itself as the thing the worker's processor calls.
- Test required: integration test — trigger `forgot-password` with mail sending forced to fail/throw, confirm the HTTP response still succeeds (200/204) and the reset token was still created; confirm a queued job exists for the email attempt.

#### [WRK-003] Dashboard aggregation queries run synchronously per-request, with no caching layer
- Severity: P3
- Module: Worker (async-work candidate) / Dashboards
- File/path: `apps/api/src/dashboards/dashboards.service.ts` (all six methods — `getOwnerDashboard`, `getProductionDashboard`, `getMachineDashboard`, `getInventoryDashboard`, `getQualityDashboard`, `getMaintenanceDashboard` — each runs 3-8 `Promise.all`-parallelized Prisma `aggregate`/`groupBy` queries directly against the request)
- Current behavior: every dashboard load re-runs the full set of aggregation queries live, with zero caching (no Redis cache-aside, no TTL, no memoization).
- Expected behavior: SRS §16.2 explicitly calls for "large reports... processed through background jobs" and "Redis... used for appropriate caching." At current/demo data volumes this is fine (confirmed no correctness issue — these are real, not mocked, aggregations per `DEVELOPMENT_LOG.md`), but it's the clearest concrete match in the current codebase for the caching requirement.
- Why it matters: forward-looking scalability concern, not a present defect — flagging now so it's on the roadmap before a real tenant's dashboard load starts doing multi-second aggregate scans across large `ProductionBatch`/`StockMovement` tables with no index-assisted caching layer in front.
- SRS reference: §16.2, §16.3 (scalability target: "millions of transactions")
- Recommended fix: add a short-TTL Redis cache (e.g. 30-60s) keyed by `tenantId + dashboard-name`, invalidated either on TTL alone (simplest) or on the relevant mutation events; no need for a full background-job model for this specific case unless report volume grows to justify it.
- Test required: none needed now; once caching is added, a test confirming a second dashboard request within the TTL window doesn't re-hit the database (query-count assertion).

#### [WRK-004] `NotificationsService.notify()` exists but has zero callers — none of SRS §12.7's required notification triggers are wired
- Severity: P2
- Module: Worker (async-work candidate) / Notifications
- File/path: `apps/api/src/notifications/notifications.service.ts:29` (`notify()` method, confirmed via repo-wide grep to have no call sites anywhere in `apps/api/src` outside its own file and, if present, tests)
- Current behavior: the `Notification` model, controller (list/mark-read/mark-all-read), and service exist and work for whatever gets created — but nothing in Sales, Inventory, Production, Maintenance, or Quality actually calls `notify()`. The module's own doc comment confirms this directly: "none of those triggers are wired up yet." Email channel delivery for notifications is also not connected to `MailService`.
- Expected behavior: SRS §12.7 requires notifications to actually fire for: low stock, production delay, machine breakdown, maintenance due, quality rejection, pending approval/purchase approval, order deadline, attendance alerts.
- Why it matters: this is a fully-scaffolded-but-inert feature — a tenant relying on in-app notifications for e.g. low-stock alerts will simply never receive one, silently. Several of these triggers (low-stock check, maintenance-due check) are natural scheduled/cron-style background jobs rather than request-time side effects, which is why this is grouped with the worker audit rather than treated as a simple missing-function-call bug.
- SRS reference: §12.7
- Recommended fix: wire the request-time triggers first (machine breakdown on `DowntimeService.create()` for MECHANICAL/ELECTRICAL categories — this already exists as a maintenance-job auto-create per `DEVELOPMENT_LOG.md`'s D-013-area note, so a notification call is a natural addition at the same call site; quality rejection on `QualityInspection` outcome=REJECT; pending-approval on Purchase Request creation) directly in the relevant services; defer the scheduled checks (low stock, maintenance due) until `apps/worker` exists and can run them on an interval.
- Test required: for each wired trigger, an integration test that performing the triggering action (e.g. creating a REJECT quality inspection) results in a `Notification` row for the appropriate user(s).

#### [WRK-005] Architectural risk: tenant context (AsyncLocalStorage) will NOT automatically survive into a future BullMQ job — must be explicitly re-established in every processor
- Severity: P2 (forward-looking design requirement, not a bug in existing code — see reasoning below on why this is P2 and not P0/P1)
- Module: Worker / Multi-Tenancy (cross-cutting)
- File/path: `apps/api/src/common/tenant-context.ts` (`TenantContextStore`, `AsyncLocalStorage`-based), `apps/api/src/prisma/prisma.service.ts:32-59` (`buildScopedClient` — the Prisma Client Extension that reads `TenantContextStore.get()`)
- Current behavior: today, tenant context is established per-HTTP-request (via an interceptor, per `DEVELOPMENT_LOG.md`'s D-015 writeup) and lives only for the duration of that request's call stack, via Node's `AsyncLocalStorage`. **This context is bound to the originating request's async call chain — it does not cross a process boundary, and does not survive a BullMQ job being dequeued and processed later** (whether by a separate `apps/worker` process, as the architecture intends, or even by an in-process `@Processor` handler, since BullMQ job processing happens on a fresh async context, not nested inside the original HTTP request's context). Concretely: if a future job handler calls `this.prisma.db.salesOrder.findMany(...)` without first re-establishing context, `TenantContextStore.get()` returns `undefined` inside the Prisma extension.
- Expected behavior — and the actual, verified good news: I traced exactly what happens in that case (`prisma.service.ts:41-56`) — the extension **fails closed**: `if (!ctx) throw new ForbiddenException(...)`. It does NOT silently fall through to an unscoped query. This means the realistic failure mode of "forgot to re-establish tenant context in a job" is **the job crashes/throws immediately**, not **the job silently reads/writes across tenants**. That is why this finding is P2 (a correctness/robustness requirement to get right before shipping workers) rather than P0/P1 (an active security hole) — the existing fail-closed design is exactly the right safety net for this future risk, and it must be preserved.
- Why it matters: even though the failure mode is safe-by-default, an unhandled `ForbiddenException` thrown inside a job processor with no re-establishment logic will look like a mysterious, total failure of every tenant-scoped job — worth documenting now so whoever builds `apps/worker` doesn't have to rediscover this by trial and error, and so the *fix* (explicit re-establishment) is designed in from job #1 rather than retrofitted.
- SRS reference: §3.2, §3.3 (tenant isolation mandatory), §16.2 (background jobs)
- Recommended fix: establish a required convention before any processor ships: (1) every job payload enqueued from `apps/api` must explicitly include `{ tenantId, userId, factoryId? }` alongside its business payload; (2) every processor's handler must open with `TenantContextStore.run({ tenantId, userId, ... }, async () => { /* actual handler body, including any prisma.db calls */ })` before touching any tenant-scoped model, exactly mirroring what the HTTP interceptor does today for requests. Consider a small shared helper (e.g. a `@WithTenantContext()` processor decorator or a `runInTenantContext()` utility in a shared package) so this isn't hand-rolled per job and can't be forgotten.
- Test required: once the first real processor exists — a test that a job payload missing `tenantId` fails loudly (doesn't silently no-op or leak), and a test that a job's `prisma.db` calls are correctly scoped to the `tenantId` carried in its payload, not to whatever tenant happened to enqueue a *different*, concurrently-running job (i.e., no context bleed between concurrently processed jobs in the same worker process).

#### [WRK-006] No retry, idempotency, or dead-letter strategy exists yet for background jobs — required before any job handling business-critical data ships
- Severity: P3 (roadmap/requirements finding — nothing to fix in current code, since no jobs exist yet)
- Module: Worker
- File/path: N/A — forward-looking requirement
- Current behavior: N/A, no job infrastructure exists.
- Expected behavior: given the roadmap already includes financial/production-relevant background work (email delivery, and eventually likely reports, exports, and the scheduled notification checks from WRK-004), the following should be decided and documented before `apps/worker` starts handling real traffic:
  - **Retry strategy**: BullMQ's built-in exponential-backoff retry (`attempts`, `backoff`) should be configured per job type — e.g. email sends might retry 3-5 times over minutes/hours; anything that mutates business data (once such jobs exist) needs more careful design since retrying a partially-applied side effect is exactly the idempotency problem below.
  - **Idempotency**: any job that could be enqueued more than once for the same logical action (e.g. a retried API request re-enqueuing the same "send welcome email" job) needs either a natural dedupe key (BullMQ job IDs support this) or an idempotency check inside the processor itself, so a duplicate job doesn't double-send an email or, more seriously, double-apply a future stock/financial side effect.
  - **Dead-letter handling**: jobs that exhaust their retries need to land somewhere visible (a failed-jobs queue/table, or at minimum structured error logging with enough context — tenant, job type, payload — to manually replay) rather than silently vanishing.
- Why it matters: getting this wrong is exactly the kind of gap that's invisible until a production incident (an email silently never sent after 1 retry, or worse, a future job double-applying a side effect on retry) — cheap to design correctly now, expensive to retrofit after jobs are already live and being depended on.
- SRS reference: §16.2, §17.6 (general reliability posture)
- Recommended fix: adopt BullMQ's native retry/backoff config as the default, require every processor to be written idempotently from day one (treat this as a code-review checklist item, not an afterthought), and add a minimal dead-letter visibility mechanism (even just a `FailedJob` audit table or structured log alert) before the first job type ships to production.
- Test required: once job infrastructure exists — a test that enqueuing the same idempotency-keyed job twice results in the side effect happening once; a test that a processor throwing on every attempt ends up in a visible failed/dead-letter state rather than disappearing.

---


---

## 15. Security Audit

*(Full findings from the dedicated general Application Security Audit stream -- IDOR, mass assignment, injection, XSS, CSRF, secrets, CORS, headers, rate limiting. Deep tenant-isolation/IDOR analysis is Sections 8-9.)*

## Security Audit — AbyteTex (Application Security Surface)

Scope: general application security beyond tenancy/RBAC/authentication internals (covered by a
parallel audit) and inventory integrity (covered by a separate parallel audit). Read-only review
of `apps/api/src` and `apps/web/src`, plus a repo-wide secret/dependency scan.

---

#### [SEC-001] No production-environment guard on the dev "log emails instead of sending" fallback — password-reset and invite tokens can land in plaintext server logs
- Severity: P1
- Module: Security
- File/path: `apps/api/src/mail/mail.service.ts` (lines 27–50), `apps/api/src/config/env.validation.ts` (`SMTP_HOST` etc. are `.optional()` with no production-only `.refine()`)
- Current behavior: `MailService.onModuleInit()` only switches to real SMTP sending if `SMTP_HOST` is set; otherwise `send()` calls `this.logger.warn(...)` with the full rendered email body, which for `sendPasswordReset`/`sendWelcome` includes the raw password-reset / set-password URL (i.e. the bearer token itself, since possession of that URL is equivalent to a password reset). `env.validation.ts` makes every `SMTP_*` var optional regardless of `NODE_ENV`, so there is no fail-fast/fail-safe check that forces SMTP to be configured in production — a fresh production deploy that simply forgot to set `SMTP_HOST` (an easy mistake, since `.env.example` ships it blank) silently falls back to writing live password-reset and account-invite tokens into whatever the process's stdout/log pipeline is (journald, Docker logs, a log-aggregation service, etc.), rather than failing loudly.
- Expected behavior: In production, either SMTP must be configured (fail fast at boot, matching the existing "fail fast on missing env" philosophy already used for `JWT_*`/`DATABASE_URL`), or if a log-fallback must be kept for degraded-mode operation, the logged content must redact the token/URL rather than including it verbatim.
- Why it matters: Anyone with read access to the API's logs (ops tooling, a misconfigured log shipper, a compromised log-aggregation account, or a container log left world-readable) could harvest live password-reset links and take over any account whose owner requested a reset while SMTP was unset — this is a direct authentication-bypass path, not just an info leak.
- SRS reference: §16.1 (secure environment-variable management; secure cookies/tokens), §5.1 (password reset)
- Recommended fix: Add a Zod `.superRefine()` in `env.validation.ts` that requires `SMTP_HOST`/`SMTP_USER`/`SMTP_PASSWORD` to be set when `NODE_ENV === 'production'`, failing boot otherwise; additionally, never log the full reset/invite URL even in the dev fallback — log "email queued for X, token omitted" or truncate the token.
- Test required: Boot the API with `NODE_ENV=production` and `SMTP_HOST` unset — must fail to start. With SMTP configured, trigger forgot-password and confirm the token never appears in application logs.

---

#### [SEC-002] Next.js frontend ships with zero security headers — no CSP, no X-Frame-Options/frame-ancestors, no Referrer-Policy
- Severity: P2
- Module: Security
- File/path: `apps/web/next.config.ts` (only sets `transpilePackages`, no `headers()` function); contrast with `apps/api/src/main.ts` which does apply `helmet()` — but only to the JSON API, not to the page-serving frontend origin
- Current behavior: `helmet()` is applied on the NestJS API (`main.ts:16`), which is good for the JSON API responses, but the actual HTML-rendering, user-facing origin (`apps/web`, Next.js on `:3000`, the thing a browser actually loads and executes JS in) has no equivalent — no `Content-Security-Policy`, no `X-Frame-Options`/`frame-ancestors` (clickjacking exposure — the app could be iframed by a malicious page and overlaid), no `Referrer-Policy`, no `Strict-Transport-Security` set by the app itself (may be added at the Nginx layer per SRS §17.5, but nothing in-repo confirms that).
- Expected behavior: The frontend that actually renders HTML and holds the in-memory access token is the higher-value target for clickjacking/CSP-based defense-in-depth; it should set at minimum `X-Frame-Options: DENY` (or `frame-ancestors 'none'` via CSP), `Referrer-Policy: strict-origin-when-cross-origin`, and ideally a CSP restricting script/style/connect-src to known origins.
- Why it matters: No XSS sink was found in this audit (no `dangerouslySetInnerHTML`, no `innerHTML`/`eval` usage), so this is defense-in-depth rather than an active exploit path today — but as the app grows (rich-text notes, file previews, third-party embeds), the complete absence of CSP means there is currently no browser-enforced backstop if an XSS bug is introduced later, and no clickjacking protection at all today.
- SRS reference: §16.1 (security controls generally; the SRS doesn't itemize CSP specifically, but this falls under "the system shall implement... secure cookies/tokens" and general hardening intent)
- Recommended fix: Add a `headers()` function in `next.config.ts` (or Nginx-layer headers, since SRS §17.5 puts Nginx in front) setting `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and a baseline CSP (`default-src 'self'; connect-src 'self' <API_URL>; frame-ancestors 'none'`), tuned once real third-party assets (fonts, file previews) are known.
- Test required: Load the deployed frontend and confirm via response headers (`curl -I`) that `X-Frame-Options`/CSP are present; attempt to iframe a logged-in page from an external origin and confirm the browser blocks it.

---

#### [SEC-003] Docker Compose ships hardcoded weak default credentials for Postgres and MinIO with no environment-specific override checked into the repo
- Severity: P2
- Module: Security
- File/path: `docker-compose.yml` (`POSTGRES_PASSWORD: abytetex`, `MINIO_ROOT_PASSWORD: abytetex-secret`, both literal, un-parameterized)
- Current behavior: The only Compose file in the repo hardcodes trivial, guessable credentials directly in the YAML rather than reading them from `.env`/`${VAR}` substitution. SRS §17.5 says deployment "shall use Docker and Docker Compose initially... on a VPS/cloud host," and no second, production-specific compose override or `${POSTGRES_PASSWORD}`-style indirection exists in the repo to confirm these get overridden before a real deployment.
- Expected behavior: Compose files should read credentials from environment variables/secrets (e.g. `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}`) with no safe default baked in for anything beyond pure local dev, and a documented separate production compose/override should exist so a VPS deploy can't accidentally inherit `abytetex`/`abytetex-secret`.
- Why it matters: If this file is reused as-is for a production VPS deploy (nothing in the repo currently prevents that), the database and object-storage root credentials would be `abytetex`/`abytetex-secret` — trivially guessable, and if Postgres/MinIO ports are ever exposed (even briefly, or via a firewall misconfiguration) this is a full data-breach path for a multi-tenant system holding every tenant's data in one database.
- SRS reference: §16.1 (database access restrictions, secure environment-variable management), §17.5 (infrastructure/deployment)
- Recommended fix: Parameterize `docker-compose.yml` with `${POSTGRES_PASSWORD}` etc. sourced from `.env` (which is already gitignored), and add a `docker-compose.prod.yml` (or equivalent) that never ships a default value for these, forcing the deployer to supply real secrets.
- Test required: Attempt `docker compose up` with the production override and no `POSTGRES_PASSWORD` set — should fail rather than silently starting with a weak default.

---

#### [SEC-004] Rate limiting is a single flat global default with no per-endpoint tuning for expensive vs. cheap operations
- Severity: P3
- Module: Security
- File/path: `apps/api/src/app.module.ts:54` (`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])`), `apps/api/src/dashboards/*`
- Current behavior: Every endpoint in the system (list pages, dashboards' aggregation queries, and — once built — any future export/report endpoint) shares one global limit of 100 requests/minute per client, with the only overrides being the four auth endpoints (`login`/`refresh`/`forgot-password`/`reset-password`) which are tightened via `@Throttle`. Dashboard aggregation queries (Owner/Production/Machine/Inventory/Quality/Maintenance — six real Prisma aggregation endpoints per the dev log) run multiple GROUP BY/aggregate queries per call and have no lower limit despite being more expensive per-request than a simple paginated list; conversely, 100/min is a reasonable ceiling for normal TanStack Query traffic (list pages + polling), so it isn't currently causing legitimate-user 429s, but it also provides no throttling headroom specifically against dashboard-endpoint abuse (e.g., a scripted client hammering `/dashboards/*` at the shared limit still gets 100 expensive aggregation queries/minute).
- Expected behavior: Consider a tighter `@Throttle` override on the dashboard/aggregation controllers (and any future export/report endpoints) independent of the general CRUD/list-page limit, per SRS §16.1's general rate-limiting intent and §16.2's "large reports shall be processed through background jobs" guidance (nothing here is backgrounded yet).
- Why it matters: Not an active vulnerability today (no export endpoints exist yet, and 100/min per client is not exploitable for meaningful DoS against a single-VPS deployment), but it's the kind of gap that becomes a real cost/availability problem once reports/exports are built, since those are exactly the endpoints most likely to be expensive per call.
- SRS reference: §16.1 (rate limiting), §16.2 (performance — background jobs for large reports)
- Recommended fix: Add a stricter `@Throttle` (e.g. 20–30/min) on `DashboardsController` methods and any future export endpoints; keep the 100/min global default for ordinary CRUD/list traffic.
- Test required: Load-test a dashboard endpoint at >the intended limit and confirm 429s trigger before it degrades API-wide response time for other tenants.

---

#### [SEC-005] CORS_ORIGIN supports exactly one literal origin string, not a list — will require a hotfix-style redeploy to add a second allowed origin
- Severity: P3
- Module: Security
- File/path: `apps/api/src/main.ts:18-21` (`app.enableCors({ origin: configService.get('corsOrigin'), credentials: true })`), `apps/api/src/config/env.validation.ts:12` (`CORS_ORIGIN: z.string().min(1)`)
- Current behavior: `CORS_ORIGIN` is validated and consumed as a single opaque string, passed directly as the `cors` package's static `origin` option. This is correctly *not* a wildcard-with-credentials misconfiguration (a real, common mistake) and does *not* reflect the request's `Origin` header back (also correctly avoided) — so the CORS boundary itself is sound and env-driven, not hardcoded. However, because it's a single string rather than a parsed list, supporting more than one legitimate frontend origin at once (e.g. `https://app.abytetex.com` and `https://staging.abytetex.com`, or a bare + `www.` domain pair) is not possible without changing the deployment's env value, and any typo'd or multi-value `CORS_ORIGIN` (e.g. a comma-separated list someone assumes is supported) would silently become a single non-matching string, causing CORS failures rather than an over-permissive hole — the failure mode is safe, but confusing.
- Expected behavior: Parse `CORS_ORIGIN` as a comma-separated list and pass an array (or a validating function) to `enableCors`, so multiple legitimate origins can be supported per environment without code changes.
- Why it matters: Low severity — the current design fails closed (extra/unlisted origins are simply rejected), so this is an operational limitation rather than a vulnerability. Flagging because SRS's deployment story (multiple environments, eventual multi-region expansion) will likely need more than one allowed origin per API deployment before long.
- SRS reference: §16.1 (secure cookies/tokens, environment-driven config), §17.5 (infrastructure)
- Recommended fix: `CORS_ORIGIN="https://a.com,https://b.com"` parsed via `.split(',').map(s => s.trim())` and passed as an array to `enableCors`.
- Test required: Set two comma-separated origins, confirm both are allowed and any third origin is rejected.

---

#### [SEC-006] argon2id called with library defaults — reasonable but not explicit/tunable, and worth confirming against current hardware
- Severity: P3
- Module: Security
- File/path: `apps/api/src/auth/password.util.ts:6` (`argon2.hash(plain, { type: argon2.argon2id })`)
- Current behavior: Only `type: argon2id` is specified; `memoryCost` (64 MiB), `timeCost` (3), and `parallelism` (4) all come from the `node-argon2` library's built-in defaults rather than being set explicitly in this codebase. These defaults currently meet or exceed OWASP's minimum recommendation (≥19 MiB memory cost, argon2id), so this is **not** a weak configuration as shipped — flagging only because (a) the values aren't visible/documented in this codebase, so a future library upgrade that changes its defaults would silently change the app's security posture with no code diff to review, and (b) explicit tuning is generally preferred so the parameters can be deliberately increased as server hardware improves.
- Expected behavior: Pass `memoryCost`/`timeCost`/`parallelism` explicitly (even if set to today's library defaults) so the values are pinned, documented, and intentionally reviewed on future changes.
- Why it matters: Low severity today since the effective parameters are adequate; this is a maintainability/auditability recommendation, not an active weakness.
- SRS reference: §16.1 (secure password hashing)
- Recommended fix: `argon2.hash(plain, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 })` (or higher, load-tested against the target VPS), with a comment explaining the choice.
- Test required: None functional — a code review / config-pinning change only.

---

#### [SEC-007] File upload capability (SRS §15.1) is entirely unbuilt — confirmed, not a live vulnerability
- Severity: P3
- Module: Security
- File/path: N/A — no `multer`, `FileInterceptor`, `S3Client`/`@aws-sdk`, or any upload-handling code exists anywhere in `apps/api/src`; `S3_*` env vars and a MinIO container exist in config/`docker-compose.yml` but are entirely unconsumed by application code
- Current behavior: SRS §15.1 requires attaching invoices, quality images, production/maintenance/customer documents to records, stored in object storage rather than Postgres. No such feature exists yet — confirmed via repo-wide search, and consistent with `DEVELOPMENT_LOG.md`'s own "Open/Next" notes listing file uploads as still out of scope.
- Expected behavior: N/A for this audit pass — noted so the eventual implementation is tracked and, when built, gets file-type/size validation, filename sanitization (path traversal), and access-controlled serving (signed URLs or an authenticated proxy, not public bucket reads) from day one rather than retrofitted.
- Why it matters: Not a current vulnerability — recorded so this audit's file-handling checklist item isn't silently skipped, and so the eventual implementation is reviewed against this list (type/size validation, path traversal in filenames, access control on retrieval) before shipping.
- SRS reference: §15.1
- Recommended fix: N/A now; when built, validate MIME type and size server-side (not just client-side), generate server-side storage keys (never trust a client-supplied filename/path), and serve via short-lived signed URLs or an authenticated download endpoint that re-checks tenant/permission on every fetch.
- Test required: N/A until implemented.

---

### Findings confirmed clean (no issues found)

- **Mass assignment**: Every create/update endpoint reviewed uses an explicit `class-validator` DTO (allow-list), and the global `ValidationPipe` is configured with `whitelist: true, forbidNonWhitelisted: true, transform: true` (`apps/api/src/main.ts:27-33`) — any field not declared on the DTO is rejected with a 400, not silently dropped or passed through. No DTO exposes `id`, `tenantId`, `createdBy`, or a creation-time `status`-as-approval field to the client; `orderNumber`/`batchNumber`-style identifiers are generated server-side per the dev log. `req.body`/raw untyped bodies are not used anywhere in `apps/api/src` outside typed `@Body() dto: SomeDto` parameters.
- **SQL injection**: Only one raw-SQL call exists in the entire backend — `apps/api/src/health/health.controller.ts:12`, a static tagged-template `` this.prisma.raw.$queryRaw`SELECT 1` `` with no interpolation. No `$queryRawUnsafe`/`$executeRawUnsafe` calls exist anywhere, and no string concatenation feeds any query.
- **XSS**: No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, or `eval`/`new Function` usage anywhere in `apps/web/src`. All user-supplied text (customer names, notes, defect descriptions, etc.) renders through normal JSX text interpolation, which React escapes by default. No HTML/rich-text-from-storage rendering path exists.
- **CSRF reasoning on `/auth/refresh`**: The refresh cookie is `httpOnly`, `sameSite: 'lax'`, scoped to `path: '/api/v1/auth'` (`apps/api/src/auth/auth.controller.ts:92-99`). Because the actual API authorization header uses a Bearer token held only in frontend memory (never a cookie), a forged cross-site request to any *protected* endpoint is inherently CSRF-safe — the attacker's page cannot read or attach the access token. The narrower question is `/auth/refresh` itself: a malicious site issuing a cross-site `fetch`/form POST to `/auth/refresh` would, under `SameSite=Lax`, **not** have the refresh cookie attached by a modern browser (Lax only sends cookies on top-level, same-site-safe navigations — not on cross-site XHR/fetch/form POSTs), so this is not practically exploitable as shipped. The real backstop, as the audit brief anticipated, is CORS: `enableCors({ origin: <single configured origin>, credentials: true })` means even a same-site-cookie-bearing request from an unlisted origin would be blocked by the browser's CORS preflight/response check before any response body reached the attacker's page (though a "blind" POST without reading the response is a separate, lower-value consideration — the worst a successful blind refresh could achieve is rotating the victim's own refresh token, which doesn't benefit the attacker without also stealing the resulting access token from the response, which CORS prevents them from reading). Net assessment: **CSRF-safe as designed**, correctly using `SameSite=Lax` + strict single-origin CORS as the two independent mitigations the brief asked about.
- **Token leakage**: No JWT/refresh-token value appears in any `console.log`/`Logger` call in `apps/api/src/auth/**` (confirmed via grep — zero matches). The access token is never placed in a URL/query string on either side; it's carried only in the `Authorization: Bearer` header (`apps/api/src/auth/auth.controller.ts`, `apps/web/src/lib/api-client.ts:92`) and the refresh token only in the httpOnly cookie. The frontend's Zustand auth store (`apps/web/src/store/auth-store.ts`) holds the access token in plain in-memory state with no `persist` middleware — it is never written to `localStorage`/`sessionStorage`, limiting exposure if an XSS bug is ever introduced later.
- **CORS configuration**: Explicit, env-driven single-origin allow-list with `credentials: true`; does **not** use `*` and does **not** reflect the request's `Origin` header back — the two classic misconfigurations the brief called out are both absent. (See SEC-005 above for the separate, lower-severity "single origin only" limitation.)
- **Weak password handling**: `ChangePasswordDto`/`ResetPasswordDto` both enforce `@IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1 })` server-side via class-validator (`apps/api/src/auth/dto/*.ts`) — this is enforced independent of any client-side check. No plaintext password appears in any log call (grep across `apps/api/src` found no `console.log`/`Logger` calls referencing password values; the one email-body log in `mail.service.ts` covered separately in SEC-001 concerns reset *tokens*, not passwords).
- **Exposed secrets**: `git ls-files | grep -E "^\.env$"` returns nothing — `.env` is **not** tracked in git; only `.env.example` is, and it contains only placeholder/local-dev values (`change-me-...`, `localhost` URLs, `abytetex`/`abytetex-secret` local-only creds already flagged separately in SEC-003). `git log --all --full-history -- .env` returns no history — `.env` has never been committed at any point in this repo's history. `.gitignore` correctly excludes `.env`/`.env.local`/`.env.*.local` while allow-listing `.env.example`. A repo-wide grep for API-key-shaped strings (AWS `AKIA...`, OpenAI `sk-...`, Google `AIza...`, Slack `xox...`) found nothing. **No secrets are committed to git.**
- **Sensitive data in logs**: The only `Logger`/`console.log` calls found outside the mail-fallback (SEC-001) are: a boot-confirmation log (`main.ts`), the generic 500-error stack-trace log (`all-exceptions.filter.ts`, server-side only, never returned to the client), SMTP-not-configured warnings, and a permission-backfill info log — none include request bodies, full user objects, password hashes, or tokens.
- **Overly verbose errors**: `AllExceptionsFilter` (`apps/api/src/common/filters/all-exceptions.filter.ts`) always returns a generic, consistent envelope (`statusCode`/`error`/`message`/`path`/`timestamp`) regardless of environment — it never serializes a stack trace or raw exception object into the HTTP response body; stack traces are only written to server-side logs for 5xx errors. Prisma errors are explicitly mapped to generic messages (`P2002` → "A record with this value already exists", `P2025` → "Record not found", `P2003` → generic FK message, everything else → "A database error occurred") — raw Prisma error text (which would reveal table/column names) is never forwarded to the client, in dev or prod. This exceeds the brief's bar; no dev/prod distinction is even necessary since it's safe unconditionally.
- **Rate limiting presence**: `@nestjs/throttler` is correctly wired globally (`ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` + `APP_GUARD`), with tighter overrides on `login`/`refresh`/`forgot-password`/`reset-password`. Tuning granularity is covered separately in SEC-004.
- **Security headers presence (API)**: `helmet()` is applied globally in `apps/api/src/main.ts:16` with default options (CSP, COOP/COEP/CORP, HSTS, X-Frame-Options, X-Content-Type-Options, etc., all from helmet v8's secure defaults) — reasonable for a JSON API. The corresponding gap on the frontend origin is SEC-002 above.
- **Dependency risk**: Reviewed `package.json` at root, `apps/api`, and `apps/web`. Versions are current-generation and actively maintained (NestJS 10.4.x, Prisma 5.22, argon2 0.41, helmet 8.0, Next.js 16.3.5, React 19.2, Zustand 5, TanStack Query 5) — nothing obviously abandoned or carrying known unpatched CVEs at a glance. `npm audit` was not run (per instructions, only if fast/safe, and it was skipped to stay within read-only/non-invasive scope for this pass) — recommend running it separately as a follow-up.

---

### Summary

| Severity | Count |
|---|---|
| P0 | 0 |
| P1 | 1 (SEC-001) |
| P2 | 2 (SEC-002, SEC-003) |
| P3 | 4 (SEC-004, SEC-005, SEC-006, SEC-007) |
| **Total** | **7** |

**Secrets committed to git: No.** `.env` was never tracked or committed at any point in history; only `.env.example` (placeholder values) is tracked. Repo-wide scans for API-key-shaped strings found nothing.

One item squarely in another audit's territory, noted in passing per instructions: `apps/api/src/users/dto/update-user.dto.ts` lets an admin-facing `PATCH /users/:id` accept `roleIds`/`status` in one call — this is a legitimate admin capability gated by `@RequirePermission(Resource.USER, Action.UPDATE)`, not a mass-assignment bug, but its exact RBAC gating (who can grant which roles to whom) is the RBAC-audit's territory, not this one's.

---

## 16. Automated Testing Gap

**Current state: zero automated tests exist anywhere in the repository** — no unit tests, no integration tests, no API/e2e tests, no security regression tests, no multi-tenant isolation tests, confirmed independently by all eight audit streams (Jest is configured in `apps/api/package.json` but has nothing to run). This is the single highest-leverage gap in the project: every bug in this report was found by a human/agent reading code, and nothing prevents any of them from being silently reintroduced by a future change, including the two bugs (D-015, D-023) this project has already fixed once.

### Required test strategy, by category and business risk

**Priority 1 — Security & multi-tenant isolation (write first, before anything else).** The highest blast-radius category: a regression here leaks one tenant's data to another.
- The 7 Gherkin-style scenarios in §8 ("Explicit Tenant-Isolation Test Scenarios") — cross-tenant IDOR-by-ID-guessing, cross-tenant list leakage, the TEN-001 Quality Dashboard regression test specifically, client-supplied-tenantId rejection, platform-admin-zero-bypass, `.raw`-escape-hatch scoping, cross-tenant update/delete via a child-resource ID.
- RBAC-TEST-1 (§9) — factory-scoped user cannot access another factory's resources (currently would fail — RBAC-001 is unfixed).
- AUTH-TEST-1 (§13) — refresh-token reuse revokes the whole session family (currently would fail — AUTH-001 is unfixed).
- A generic sweep: for every one of the 139 endpoints, a freshly-authenticated zero-permission user gets 403, not 200/201 (confirmed manually true today per §12s summary — worth locking in as a regression suite, not just a one-time manual finding).

**Priority 2 — Inventory ledger integrity.** Second-highest blast radius: a regression here corrupts financial/stock data silently.
- Concurrent double-receive/double-issue race producing a duplicate `Stock` row (regression test for DB-002/INV-007).
- `transferStock()` partial-failure rollback (INV-001).
- Negative-stock rejection (INV-002).
- Goods Receipt / Dispatch / Batch Output / Material Consumption atomicity — force a failure mid-sequence and assert full rollback, not partial commit (API-001 through API-004).
- FIFO ordering correctness after an unrelated adjustment touches an older batch (INV-003).

**Priority 3 — Business workflow / state-machine tests.** Once transition guards are added per §25s roadmap, every one of the ~19 "Test required" entries in §11 becomes a regression test: for each of the 7 lifecycles, assert only SRS-adjacent transitions succeed and all others 400. Until the guards exist, these same test cases should still be written as **failing/documenting tests** (asserting today's actual, wrong, permissive behavior) so the fix's correctness is verifiable by a flipped assertion, and so no fix silently regresses further.

**Priority 4 — API contract tests.** DTO validation boundaries (API-008, API-009), HTTP-semantics (API-010), idempotency/duplicate-submission (API-005 — directly relevant given the product's own offline/unreliable-connectivity design intent, SRS §18).

**Priority 5 — Frontend.** Given the backend is the trust boundary, frontend tests are lower business risk but still valuable: form validation once FE-002s zod migration lands, permission-gated rendering (FE-003/FE-005), and a Playwright smoke suite re-covering what `DEVELOPMENT_LOG.md` describes as manually verified once (login, CRUD-through-the-UI, RBAC-hides-buttons) so it stays true after every future change instead of being a one-time snapshot.

**Test type breakdown:**

| Type | What it covers here | Current coverage |
|---|---|---|
| Unit | Service-layer business logic (transition guards once added, discount/quantity validation, `InventoryService` matching logic) | 0% |
| Integration | Multi-write flows against a real test DB (Goods Receipt, Dispatch, Batch Output atomicity; tenant-scoping Prisma extension) | 0% |
| API/e2e | Full HTTP request/response cycles per endpoint, including auth/permission boundaries | 0% |
| Security | Cross-tenant, IDOR, permission-bypass regression suite (§8/§9 scenarios) | 0% |
| Multi-tenant | Dedicated suite for the 7 tenant-isolation scenarios + RBAC-TEST-1 | 0% |
| Inventory | Concurrency/race/atomicity suite (Priority 2 above) | 0% |
| Workflow | State-machine transition suite, one file per lifecycle | 0% |
| E2E (browser) | Playwright smoke suite re-covering the one-time manual verification already done | 0% (was done manually once, not automated) |
| Offline (SRS §18) | N/A — feature doesn't exist yet (see §22 Missing Features) | N/A |

**Recommendation:** stand up a test database + `jest` (already configured) or a lightweight e2e harness against a real Postgres instance (Testcontainers or a dedicated CI Postgres service) before writing the P0 fixes in §25 — every P0/P1 fix in this report should ship with the specific regression test named in its "Test required" field, not be marked done without one, given this project's own documented history of "compiles/lints clean" not meaning "works."

---

## 17. Production Readiness Audit

*(Findings PROD-001 through PROD-006, from the dedicated Worker/Production-Readiness Audit stream. Build/Lint/Validate results were run live during this audit -- see table below.)*

### Build/Lint/Validate Results

| Check | Result |
|---|---|
| `npx prisma validate --schema=prisma/schema.prisma` | ✅ PASS — "The schema at prisma\schema.prisma is valid" |
| `prisma/migrations/` | 1 migration (`20260911200241_init`), no drift, clean sequential history |
| `apps/api`: `npx tsc --noEmit` | ✅ PASS — zero errors |
| `apps/api`: `npx eslint "src/**/*.ts"` | ✅ PASS — zero errors, zero warnings |
| `apps/web`: `npx tsc --noEmit` | ✅ PASS — zero errors |
| `apps/web`: `npx eslint .` | ⚠️ PASS with warnings — 0 errors, **10 warnings** (all identical: React Compiler "incompatible library" notices on `react-hook-form`'s `watch()` in `settings/company`, `customer-form`, `warehouse-form`, `material-form`, `product-form`, `supplier-form`, `user-form` — see PROD-006) |
| `apps/web`: `npm run build` (`next build`, production) | ✅ PASS — compiled successfully, 29 routes generated (25 static, 4 dynamic: `/factories/[id]`, `/payroll/[id]`, `/production-orders/[id]`, `/purchase-orders/[id]`, `/sales/[id]`), no errors |
| `apps/worker`: build | ❌ N/A — **no `package.json`, no source files, nothing to build** (see WRK-001) |
| `docker compose config` | Not run — Docker CLI unavailable in this environment. `docker-compose.yml` reviewed by reading instead (see PROD-002). |

**Bottom line: everything that currently exists compiles and lints cleanly, and the frontend production build succeeds end-to-end.** This confirms `DEVELOPMENT_LOG.md`'s repeated "clean build/lint" claims are accurate as of this audit. The gaps found below are about what **doesn't exist yet** (worker, CI/CD, deployment artifacts, backups), not about defects in what does.

Confirms independently (no route generated) what the Frontend audit stream separately found: there
is no `/shifts` or `/notifications` route in the `next build` output — consistent with that stream's
finding that those two modules are unreachable from navigation.

### Part B — Production Readiness Audit

#### [PROD-001] No CI/CD pipeline exists — `.github/workflows/` does not exist at all
- Severity: P1
- Module: Production Readiness
- File/path: repo root — `.github/` directory confirmed absent (`find .github` → "No such file or directory")
- Current behavior: there is no automated build, test, lint, or deploy pipeline of any kind. Every verification claim in `DEVELOPMENT_LOG.md` ("build clean," "lint clean") has so far been produced by manually running commands in a dev session, not enforced by CI on every push/PR.
- Expected behavior: SRS §17.5 explicitly states deployment "via Docker and Docker Compose initially... with automated deployment via GitHub Actions." This is a named, specific SRS requirement, not a generic best practice being added.
- Why it matters: without CI, there is nothing preventing a future change from silently breaking `tsc`/`eslint`/`prisma validate`/the Next.js build before it reaches `main` — the project's own stated verification discipline (manual, but consistent, per the dev log) is not backstopped by anything automatic. This also blocks the "automated deployment" half of §17.5 entirely, since there's no pipeline to deploy from.
- SRS reference: §17.5
- Recommended fix: add a minimal `.github/workflows/ci.yml` running, at minimum, the exact checks this audit ran by hand (prisma validate, tsc --noEmit for api/web, eslint for api/web, next build) on every PR/push to `main`; layer deployment automation on top once PROD-002's deployment artifacts exist.
- Test required: N/A (infrastructure, not application code) — verify by confirming a workflow run actually triggers and reports status on a test PR.

#### [PROD-002] No production deployment artifacts exist — `infra/docker`, `infra/nginx`, `infra/scripts` are empty placeholder directories; `docker-compose.yml` only covers infrastructure dependencies, not the application itself
- Severity: P1
- Module: Production Readiness
- File/path: `infra/docker/`, `infra/nginx/`, `infra/scripts/` (all three confirmed empty via `find infra -mindepth 1`, which lists only the three directory names and no files inside any of them); `docker-compose.yml` (repo root) defines only `postgres`, `redis`, and `minio` services — no `api`, `web`, or `worker` service is defined anywhere, and no `Dockerfile` exists anywhere in the repository (`find . -iname "Dockerfile*"` → zero results, excluding `node_modules`).
- Current behavior: the current `docker-compose.yml` is a **local development dependency stack only** — it correctly and cleanly stands up Postgres/Redis/MinIO with healthchecks and named persistent volumes (`postgres_data`, `redis_data`, `minio_data` — all correctly mounted, not ephemeral), which is good as far as it goes. But there is no way, today, to containerize and run `apps/api` or `apps/web` themselves, and no reverse-proxy/SSL configuration exists.
- Expected behavior: SRS §17.5's architecture diagram explicitly shows `Internet → Nginx → {Next.js, NestJS}` with SSL termination, deployed via Docker, on a VPS/cloud host. None of that layer currently exists in the repository.
- Why it matters: this repository cannot currently be deployed to a VPS or any container-orchestrated environment by following the SRS's own described architecture — every piece of that path (app Dockerfiles, an Nginx config with TLS, a production-oriented compose file or equivalent wiring the app services to the infra services) is a blank placeholder directory, not a partially-done or misconfigured one. This is the single largest concrete gap between "the app runs cleanly in dev" (confirmed true, see Build/Lint/Validate Results above) and "the app can be deployed" (currently false).
- SRS reference: §17.5
- Recommended fix: add `apps/api/Dockerfile` and `apps/web/Dockerfile` (multi-stage Node builds), an `infra/nginx/nginx.conf` (or per-environment variants) reverse-proxying to both with SSL termination (e.g. via Certbot or a load balancer's TLS), and either extend `docker-compose.yml` with `api`/`web`/`worker` services or add a separate `docker-compose.prod.yml` — whichever the team prefers, but something must exist before this can leave a developer's machine.
- Test required: N/A (infrastructure) — verify by actually building and running the resulting containers against a clean environment and confirming the app is reachable through Nginx with a valid cert in a staging environment.

#### [PROD-003] No automated backup strategy exists — zero backup scripts, zero scheduling, zero documented retention/restore process
- Severity: P1
- Module: Production Readiness
- File/path: `infra/scripts/` (confirmed empty — no backup script of any kind, shell, cron, or otherwise)
- Current behavior: nothing in the repository performs, schedules, or documents a PostgreSQL backup. There is no retention policy, no off-site storage configuration, and no restore-testing process — none of it, not even a stub.
- Expected behavior: SRS §17.6 is explicit and specific: "PostgreSQL → Daily Backup → Off-site Storage," plus "backup retention policy, backup monitoring, periodic restore testing, and a documented disaster-recovery plan... Backups shall not reside solely on the same VPS as the production database." SRS §22 (MVP Acceptance Criteria) separately lists "Database backups are automated" as a named MVP-readiness gate.
- Why it matters: this is a named MVP acceptance criterion (§22), not a "nice to have" — the product cannot be considered MVP-ready by the SRS's own definition without this existing in some form. For a multi-tenant SaaS holding a factory's production/financial records, the absence of any backup mechanism is a business-continuity risk independent of code quality elsewhere.
- SRS reference: §17.6, §22
- Recommended fix: add a scheduled `pg_dump` (or `pg_basebackup`/WAL-archiving for point-in-time recovery, if warranted) script in `infra/scripts/`, triggered via cron/CI schedule/managed-provider backup feature, writing to off-site object storage (the S3-compatible storage already configured for file attachments could serve this too, in a separate bucket/prefix), with a documented retention window and a periodic (e.g. monthly) restore-drill process written down somewhere durable.
- Test required: N/A (operational) — verify by actually restoring a backup into a fresh database and confirming data integrity, on a recurring schedule, not just once.

#### [PROD-004] No error-tracking/APM integration (Sentry or equivalent) and no structured logging library
- Severity: P2
- Module: Production Readiness
- File/path: repo-wide grep for `sentry`/`Sentry` across `apps/api/src` and `apps/web/src` → zero matches; `apps/api/package.json` has no `winston`/`pino`/`nestjs-pino` dependency — only NestJS's built-in `Logger` (confirmed via its use in `main.ts`, `mail.service.ts`, etc.)
- Current behavior: all backend logging goes through NestJS's default `Logger`, which writes formatted text to stdout — fine for local dev, but not structured (not trivially queryable/filterable by tenant, request ID, severity, etc. in a log aggregation tool) and has no error-tracking/alerting layer wired to it at all.
- Expected behavior: SRS §23's final technical-stack table names "Sentry + Logs" explicitly as the monitoring layer.
- Why it matters: without this, a production error (e.g. an unhandled exception in a request, or — relevantly to this audit's other findings — a job failure once workers exist) has no automatic surfacing mechanism beyond someone manually reading server logs; there's no alerting, no error grouping/deduplication, no stack-trace-with-context capture.
- SRS reference: §23
- Recommended fix: add `@sentry/node` (API) and `@sentry/nextjs` (web) with DSN sourced from env config (add `SENTRY_DSN` to `.env.example` alongside the other optional integrations), and consider `nestjs-pino` for structured JSON logs if the eventual log-aggregation tooling benefits from it (not strictly required by the SRS, Sentry is the named requirement).
- Test required: N/A (infrastructure) — verify by confirming a deliberately-thrown test error in a non-prod environment is captured and visible in Sentry.

#### [PROD-005] `app.enableShutdownHooks()` is never called — `PrismaService.onModuleDestroy()` exists but will not fire automatically on SIGTERM
- Severity: P2
- Module: Production Readiness
- File/path: `apps/api/src/main.ts` (no call to `app.enableShutdownHooks()` anywhere in `bootstrap()`); `apps/api/src/prisma/prisma.service.ts:70` (`async onModuleDestroy() { ... }` — the hook that exists but won't be invoked)
- Current behavior: Nest only invokes `OnModuleDestroy`/`OnApplicationShutdown` lifecycle hooks in response to process termination signals (SIGTERM/SIGINT) if `app.enableShutdownHooks()` was explicitly called during bootstrap. It was not found anywhere in this codebase. As written, `PrismaService.onModuleDestroy()` (which presumably closes the Prisma connection cleanly) will only run on a normal Nest-initiated shutdown, not on a container orchestrator sending SIGTERM (e.g. a Docker `stop`, a Kubernetes pod eviction/rolling restart, or a process manager restart).
- Expected behavior: `bootstrap()` should call `app.enableShutdownHooks()` so that a SIGTERM correctly drains the process — completing in-flight requests where feasible and closing the database connection cleanly — rather than the process being killed mid-request/mid-connection.
- Why it matters: relevant specifically because PROD-002 establishes this app is meant to run containerized behind Nginx — container restarts/redeploys are routine there, and an ungraceful shutdown under load risks dropped in-flight requests and connections left in a bad state on the Postgres side.
- SRS reference: §17.5 (containerized deployment implies orchestrator-driven restarts)
- Recommended fix: add `app.enableShutdownHooks();` in `main.ts`'s `bootstrap()`, before `app.listen(port)`.
- Test required: send SIGTERM to a running instance mid-request and confirm the in-flight request completes (or is rejected gracefully) and the process exits cleanly rather than being force-killed after a timeout.

#### [PROD-006] 10 ESLint warnings in `apps/web` — React Compiler skips memoization on every `react-hook-form` `watch()` call site
- Severity: P3
- Module: Production Readiness / Frontend (tooling)
- File/path: `apps/web/src/app/(dashboard)/settings/company/page.tsx:50`, `apps/web/src/features/customers/customer-form.tsx:36`, `apps/web/src/features/factories/warehouse-form.tsx:36`, `apps/web/src/features/materials/material-form.tsx:36,37`, `apps/web/src/features/products/product-form.tsx:38,39`, `apps/web/src/features/suppliers/supplier-form.tsx:36,37`, `apps/web/src/features/users/user-form.tsx:48,49,50`
- Current behavior: every one of these is the identical warning — React Compiler (enabled via Next.js 16's default) cannot safely memoize components that call `watch()` from `react-hook-form`, since `watch()`'s returned function reference isn't compiler-stable. `eslint` reports these as warnings (`react-hooks/incompatible-library`), not errors — build and lint both still exit 0.
- Expected behavior: not necessarily "zero warnings" (this may be an accepted, understood tradeoff of using `watch()` with the React Compiler), but this should be a conscious decision, not an unnoticed accumulation — 10 instances of the same pattern suggests it'll keep growing as more forms are added.
- Why it matters: low severity today (non-blocking, and the doc comment for the React Compiler warning explicitly says it degrades gracefully by skipping memoization rather than breaking), but worth a conscious call: either suppress/accept it as a known tradeoff (document why), or reduce reliance on broad `watch()` calls in favor of `useWatch({ name: 'field' })`-style scoped subscriptions where memoization matters.
- SRS reference: none directly — general code-quality/tooling hygiene.
- Recommended fix: either add a documented eslint-disable with rationale at these specific lines, or migrate the affected `watch()` calls to `useWatch` with a specific field name where performance is likely to matter (form-heavy pages under heavy re-render).
- Test required: none required — this is a lint-level observation, not a functional defect.

---


> **Editorial arithmetic correction (added during synthesis):** the source reports Summary states "6 P2, 2 P3." Recounting the severity of each individually-numbered finding directly gives **5 P2** (WRK-002, WRK-004, WRK-005, PROD-004, PROD-005) and **3 P3** (WRK-003, WRK-006, PROD-006). The master severity lists (Section 18-21) use the corrected 4 P1 / 5 P2 / 3 P3 breakdown (12 findings total, unchanged).


---

## 18. Critical Bugs (P0 -- 10 total)

Full detail for every ID below is in its home section (linked). Fix these before any pilot-factory rollout.

| ID | Title | Module | Full detail |
|---|---|---|---|
| TEN-001 | Quality Dashboard aggregates defect data across all tenants on the platform (confirmed live cross-tenant leak) | Multi-Tenancy | Section 8 |
| RBAC-001 | Factory-level access (UserFactoryAccess) is computed at login but never checked by any backend service | RBAC | Section 9 |
| WF-015 | Quality Reject/Hold outcomes block nothing downstream -- a batch that fails inspection can still be dispatched to a customer today | Workflow / Quality | Section 11 |
| DB-001 | ProductionBatch -- the core traceability entity -- has no soft-delete and no delete protection; a hard delete silently orphans all linked consumption/inspection/cost records | Database | Section 7 |
| DB-002 | Stock's composite unique constraint does not prevent duplicate balance rows when location/batch are NULL and two writes race (reconciled with INV-007) | Database / Inventory | Section 7 / 10 |
| DB-003 | Product/Material hard-delete strips product/material identity from historical StockMovement rows (no Restrict) | Database | Section 7 |
| DB-004 | deletedAt soft-delete columns exist on 10 models but are entirely dead code -- nothing sets them, and 3 spot-checked modules have no delete path at all | Database | Section 7 |
| API-001 | Goods Receipt creation performs 4 dependent writes (receipt, PO-item rollup, stock movement, PO status) with no transaction wrapping (reconciled with INV-005) | API / Procurement | Section 12 / 10 |
| API-002 | Dispatch creation performs stock-issue + delivered-qty + sales-order-status updates with no transaction wrapping | API / Dispatch | Section 12 |
| FE-001 | No frontend module distinguishes a failed API request (500/403/network error) from a genuinely empty list -- renders identically in all ~24 modules | Frontend | Section 6 |

---

## 19. High Priority Issues (P1 -- 32 total)

Business workflow (11) -- see Section 11 for full state tables and test cases per lifecycle:

| ID | Title | Module |
|---|---|---|
| WF-001 | Sales Order status accepts any enum value from any current state | Sales |
| WF-002 | No linkage/verification between Sales Order status and actual Dispatch/Production records | Sales |
| WF-004 | Purchase Order/Request status accepts any transition, bypassing the Approval gate entirely | Procurement |
| WF-005 | No segregation-of-duties enforcement on Purchase Order/Request approval | Procurement |
| WF-006 | Goods Receipt inventory posts before any distinct Quality Check step (SRS ordering violated) | Procurement |
| WF-007 | Production Order status accepts any transition with no batch-quantity or sequencing validation | Production |
| WF-008 | recordBatchOutput unconditionally overwrites batch status to COMPLETED, erasing a prior HOLD | Production |
| WF-012 | Dispatch can be created against a Sales Order in any status, with no Ready/Confirmed precondition | Dispatch |
| WF-013 | Dispatch has no awareness of Quality Inspection outcome -- a Rejected/Held batch can be dispatched | Dispatch / Quality |
| WF-017 | Maintenance Job status accepts any transition; machine RUNNING/BREAKDOWN state can desync | Maintenance |
| WF-018 | Preventive Maintenance "due" detection is a passive query, not a scheduled reminder; nextDueAt never advances | Maintenance |

Inventory (3) -- see Section 10:

| ID | Title |
|---|---|
| INV-001 | transferStock() is not atomic -- a transfer can partially fail, leaving stock silently lost |
| INV-002 | No negative-stock validation at application or database level |
| INV-004 | Production batch output can be marked COMPLETED with real output quantity while never updating stock (optional warehouse field) |

Database (5) -- see Section 7:

| ID | Title |
|---|---|
| DB-005 | Polymorphic referenceType/referenceId pairs have zero referential integrity |
| DB-006 | SalesOrder to ProductionOrder link is SET NULL on delete, breaking the mandated traceability chain |
| DB-007 | Tenant's own child relations inconsistently protected -- Users/Roles can outlive tenant deletion while everything else blocks it |
| DB-008 | Five parent tables (GoodsReceipt, Dispatch, QualityInspection, PayrollPeriod, PurchaseOrder) cascade-delete audit/financial/quality detail rows with no soft-delete of their own |
| DB-010 | No database-level tenant-isolation backstop; single-record reads filter by id alone in spot-checked services |

API (4) -- see Section 12:

| ID | Title |
|---|---|
| API-003 | recordBatchOutput marks a batch COMPLETED independently of the stock receipt it triggers (non-atomic) |
| API-004 | recordConsumption creates a MaterialConsumption row independently of the stock issue it represents (non-atomic) |
| API-005 | No idempotency/duplicate-submission protection on any document-creating endpoint (Sales/Purchase Orders, Goods Receipts, Dispatches, Batches) |
| API-006 | Manual stock-movement endpoints (POST /inventory/movements, /transfer) are never audit-logged |

Frontend (3) -- see Section 6:

| ID | Title |
|---|---|
| FE-002 | No form uses schema-based (zod) client-side validation; only native required or nothing |
| FE-003 | ConfirmDialog is a complete, working shared component that is never used anywhere -- all status-change actions (incl. CANCELLED/SUSPENDED) fire on one click |
| FE-004 | Reference-data picker dropdowns are capped at the first 20 records with no search, across virtually every create form |

RBAC (1), Security (1) -- see Section 9 / 15:

| ID | Title |
|---|---|
| RBAC-002 | Export/Print actions are modeled and default-granted in the permission catalog but never enforced anywhere |
| SEC-001 | Dev "log emails instead of sending" fallback is not gated by NODE_ENV -- password-reset/invite tokens can land in plaintext production logs |

Worker / Production Readiness (4) -- see Section 14 / 17:

| ID | Title |
|---|---|
| WRK-001 | apps/worker is a completely empty scaffold -- zero implementation |
| PROD-001 | No CI/CD pipeline exists (.github/workflows/ absent), contradicting SRS 17.5 |
| PROD-002 | No production deployment artifacts exist -- no Dockerfiles, no Nginx config, no way to containerize the app itself |
| PROD-003 | No automated backup strategy exists at all -- a named SRS 22 MVP acceptance criterion |

---

## 20. Medium Priority Issues (P2 -- 34 total)

| ID | Title | Module |
|---|---|---|
| WF-003 | Cancelled Sales Orders can be revived; status can move backwards | Sales |
| WF-009 | updateBatchStatus has no audit logging and no validation whatsoever | Production |
| WF-010 | Goods Receipt has no check that accepted+rejected reconcile with received quantity | Procurement |
| WF-014 | Dispatch can over-deliver beyond the Sales Order item's ordered quantity | Dispatch |
| INV-003 | "Oldest first" unbatched stock matching is not true FIFO -- Stock has no creation timestamp | Inventory |
| INV-005 | Goods Receipt item loop not wrapped in one transaction (see API-001 reconciliation, Section 12) | Inventory / Procurement |
| INV-007 | Concurrent first-time stock creation can throw a raw 500 instead of merging (see DB-002 reconciliation, Section 7) | Inventory |
| DB-009 | Actor fields (createdBy, inspectedBy, etc.) recorded as un-enforced strings instead of FKs to User | Database |
| DB-011 | Stock/StockMovement polymorphic product-or-material columns have no CHECK constraint | Database |
| DB-012 | Line-item/detail tables (7 models) systemically lack createdAt/updatedAt despite being mutated post-creation | Database |
| DB-013 | No supporting indexes for tenantId+status / tenantId+factoryId+status query patterns actually used in services | Database |
| DB-014 | ProductCategory tenant-scoped unique constraint doesn't block duplicate root-level category names | Database |
| DB-016 | Purchase line items can reference no material at all, with no compensating description field | Database |
| API-007 | .raw tenant-scoping bypass used outside documented platform-admin scope (roles, notifications) | API |
| API-008 | Several numeric DTO fields accept negative/zero values that don't make business sense | API |
| API-009 | Sales/Purchase order line-item discount is not bounded against the line total | API |
| API-013 | notify() accepts an arbitrary userId with no tenant-membership check | API / Notifications |
| API-015 | Payroll entry addition (addEntry) is not audit-logged despite being sensitive financial data | API / Payroll |
| FE-005 | Five master-data pages skip the page-level PermissionGate every other module has | Frontend |
| FE-006 | Search/filter is inconsistently available -- present on master-data lists, absent on most transactional lists | Frontend |
| FE-007 | No factory filter on the list view for most factory-scoped modules (only Inventory has one) | Frontend |
| FE-008 | "Manual state" forms (not built on react-hook-form) give zero validation feedback beyond a disabled submit button | Frontend |
| FE-009 | Numeric inputs accept negative and zero values client-side with no min constraint | Frontend |
| FE-013 | Status-change dropdowns offer every enum value with no restriction, compounding the missing-confirmation risk | Frontend |
| TEN-002 | Cross-tenant user-existence enumeration via invite-user duplicate-email check | Multi-Tenancy |
| TEN-003 | NotificationsService bypasses the tenant-scoping Prisma extension entirely (not currently exploitable) | Multi-Tenancy |
| AUTH-001 | No refresh-token-family revocation on reuse detection | Auth |
| SEC-002 | Next.js frontend ships with zero security headers (no CSP, X-Frame-Options, Referrer-Policy) | Security |
| SEC-003 | Docker Compose ships hardcoded weak default credentials for Postgres/MinIO | Security |
| WRK-002 | Password-reset and invite emails sent synchronously inline in the HTTP request | Worker |
| WRK-004 | NotificationsService.notify() has zero callers -- none of SRS 12.7's 8 required triggers are wired | Worker / Notifications |
| WRK-005 | Architectural risk: tenant context will not survive into a future BullMQ job unless explicitly re-established (fails closed today -- good) | Worker |
| PROD-004 | No error-tracking/APM integration (Sentry) and no structured logging | Production Readiness |
| PROD-005 | app.enableShutdownHooks() never called -- Prisma won't disconnect cleanly on SIGTERM | Production Readiness |

---

## 21. Low Priority Issues (P3 / Technical Debt -- 29 total)

| ID | Title | Module |
|---|---|---|
| WF-011 | PENDING_QC/REJECTED GoodsReceiptStatus values are unreachable dead states | Procurement |
| WF-016 | No audit trail for the batch-status side effect of a Quality Inspection | Quality / Production |
| WF-019 | Maintenance Schedule creation and auto-created corrective jobs are not audit-logged | Maintenance |
| INV-006 | StockMovement carries no running/point-in-time balance -- historical stock-as-of-date requires full ledger replay | Inventory |
| INV-008 | Location granularity does not carry Rack/Bin as first-class, independently trackable dimensions | Inventory |
| INV-009 | D-023 re-verification: fix is real and correctly scoped; one residual negative-stock gap remains (covered by INV-002) | Inventory |
| DB-015 | Float used for textile measurement fields (GSM/width/rollLength/weight) that may feed downstream calculations | Database |
| DB-017 | Permission table has no timestamps | Database |
| DB-018 | Majority of relations rely on Prisma's implicit onDelete defaults rather than explicit declaration | Database |
| API-010 | Unvalidated free-text sortBy passed directly into Prisma orderBy (surfaces as 500, not 400) | API |
| API-011 | No dedicated rate limiting on aggregation-heavy dashboard endpoints | API |
| API-012 | Production order status transition uses UPDATE action, not APPROVE, unlike sibling workflows (design question) | API |
| API-014 | Swagger/OpenAPI is wired but undocumented at the route level (no ApiTags/ApiOperation) | API |
| FE-010 | StatusBadge's hardcoded color set doesn't cover most status enums actually used (RUNNING/IDLE look identical) | Frontend |
| FE-011 | Several icon-only buttons have no aria-label | Frontend |
| FE-012 | Manual-state forms don't associate Label with Input via htmlFor/id | Frontend |
| FE-014 | Notifications bell has no loading indicator | Frontend |
| TEN-004 | .raw escape-hatch used in several tenant-scoped services with no structural protection against regression | Multi-Tenancy |
| RBAC-003 | Frontend has no factory-level gating, consistent with (and masking) the backend RBAC-001 gap | RBAC |
| AUTH-002 | Login has a timing side-channel that can enumerate account existence | Auth |
| AUTH-003 | No automated account lockout after repeated failed login attempts | Auth |
| AUTH-004 | Dead JWT_REFRESH_SECRET/JWT_REFRESH_EXPIRES_IN config (refresh tokens are opaque, not JWTs) | Auth |
| SEC-004 | Rate limiting is a single flat global default with no per-endpoint tuning for expensive operations | Security |
| SEC-005 | CORS_ORIGIN supports exactly one literal origin string, not a list | Security |
| SEC-006 | argon2id called with library defaults -- reasonable but not explicit/pinned/documented | Security |
| SEC-007 | File upload capability (SRS 15.1) is entirely unbuilt (tracked here so it is reviewed against this checklist when built) | Security |
| WRK-003 | Dashboard aggregation queries run synchronously per-request with no caching layer | Worker |
| WRK-006 | No retry, idempotency, or dead-letter strategy exists yet for background jobs (nothing to fix -- no jobs exist) | Worker |
| PROD-006 | 10 ESLint warnings -- React Compiler skips memoization on every react-hook-form watch() call site | Production Readiness |

---

## 22. Missing Features

Capabilities the SRS requires (or the product roadmap names) that do not exist in the codebase at all, as opposed to existing-but-flawed:

| Feature | SRS ref | Status | Notes |
|---|---|---|---|
| Offline / PWA capability (production entry, machine status, downtime, quality, attendance, selected inventory transactions) | Section 13, in MVP scope per Section 20.2 | MISSING | No service worker, no IndexedDB, no local transaction queue, no sync engine anywhere in the repo. SyncEvent Prisma model exists and is entirely unused. This is a direct conflict between the SRS MVP scope definition and DEVELOPMENT_LOG.md documented decision to treat it as out of scope -- flag for explicit product-owner resolution, not silent continuation. |
| File attachments (invoices, quality images, production/maintenance/customer documents) | Section 15.1 | MISSING | No upload endpoint, no multer/S3 client wired. MinIO container and S3 env vars exist and are entirely unconsumed. FileAsset Prisma model exists and is unused. |
| Export/Print action enforcement | Section 4.2 | MISSING (modeled only) | RBAC-002 -- the permission catalog grants these to nearly every role but no endpoint or UI control exists for either action. |
| Background job worker (apps/worker) | Section 3.1, 16.2 | MISSING | WRK-001 -- empty scaffold, zero code. |
| Notification producers for all 8 SRS 12.7 trigger events | Section 12.7 | MISSING (infra only) | WRK-004 -- storage/read/mark-read work; nothing calls notify() anywhere in the codebase. |
| CI/CD pipeline | Section 17.5 | MISSING | PROD-001 -- no .github/workflows/ directory exists. |
| Production deployment artifacts (Dockerfiles, Nginx/SSL config, prod compose) | Section 17.5 | MISSING | PROD-002 -- infra/docker, infra/nginx, infra/scripts are all empty placeholder directories. |
| Automated backup strategy | Section 17.6, named Section 22 MVP criterion | MISSING | PROD-003 -- zero backup scripts of any kind. |
| Error tracking / APM (Sentry) | Section 23 (named in final stack table) | MISSING | PROD-004. |
| Automated tests of any kind | Section 18 | MISSING | Confirmed independently by all 8 audit streams -- 0 percent coverage. |
| Abyte AI assistant | Section 14 | OUT_OF_SCOPE | Correctly not built -- the SRS itself scopes this to Phase 2 (Section 20.3), not the MVP. |
| Full payroll processing engine | Section 10.3 | OUT_OF_SCOPE | Correctly reduced to inputs-only per the SRS own stated MVP reduction; not a gap. |
| Two-factor auth / SSO / passkeys | Section 5.1 (explicitly planned future) | OUT_OF_SCOPE | Correctly deferred per the SRS own wording. |
| Biometric/RFID/mobile attendance | Section 10.2 (explicitly planned future) | OUT_OF_SCOPE | Correctly deferred. |
| WhatsApp/SMS notification channel | Section 12.7 (explicitly planned future) | OUT_OF_SCOPE | Correctly deferred (in-app + email exist as infra, though largely unwired per WRK-004). |

---

## 23. Incorrect Implementations

Capabilities that exist and appear to work on the surface but behave in a way that contradicts the SRS or produces wrong results -- distinct from Section 22 "does not exist at all":

| ID | What is wrong | Why it is incorrect, not just incomplete |
|---|---|---|
| TEN-001 | Quality Dashboard Top Defects widget shows a live cross-tenant mix, not the caller own data | Directly contradicts SRS 3.3 and the Section 22 MVP acceptance criterion "cross-tenant access is impossible" |
| RBAC-001 | Session payload advertises a factoryIds restriction that the API silently never enforces | The system claims to enforce something it does not -- worse than simply not having the feature |
| WF-015 | Quality Reject/Hold outcomes are recorded but block nothing -- contradicts SRS 9.1 implicit framing that these outcomes matter | A rejected batch shipping to a customer is the exact failure mode a quality module exists to prevent |
| WF-006 | Goods Receipt posts inventory before any Quality Check step, despite SRS 6.2 explicitly ordering Goods Receipt to Quality Check to Inventory | The sequence in the SRS is inverted in the implementation |
| DB-002 | Stock unique constraint looks like it prevents duplicate balance rows; under common real-world conditions (null location/batch) it does not | A safety mechanism that appears present but does not actually fire is worse than an absent one, since it creates false confidence |
| Dispatch status enum | PLANNED/PACKED/DELIVERED are declared in the schema (matching SRS 8.4 implied packing stage) but are permanently unreachable -- every Dispatch is born already DISPATCHED | The schema documents a lifecycle the code does not implement |
| GoodsReceiptStatus enum | PENDING_QC/REJECTED are declared but permanently unreachable (WF-011) | Same pattern -- schema promises a state machine the service layer does not provide |
| WF-008 | recordBatchOutput unconditionally clears a HOLD status set by a failed quality inspection | An explicit safety flag gets silently erased by routine, unrelated-looking code |
| WF-017 | Closing a Downtime record sets Machine status to RUNNING regardless of whether its linked corrective MaintenanceJob is still open | Two code paths that should be coordinated are not, producing an operationally misleading machine status |
| Section 20.2 vs DEVELOPMENT_LOG.md | The SRS own MVP scope table includes offline production/quality/attendance/sync engine; the project log treats offline as out of scope with no documented reconciliation | A scope decision that contradicts the baseline requirements document it is supposedly working from |

---

## 24. Technical Debt

Items that are not bugs today but increase future risk, maintenance cost, or the odds of a regression -- distinguished from the P2/P3 functional gaps above by being about code health rather than a specific wrong behavior:

- AUTH-004 -- dead JWT_REFRESH_SECRET/JWT_REFRESH_EXPIRES_IN config that no code path reads; confusing during a future incident response.
- TEN-004 / API-007 -- the .raw Prisma escape-hatch is used in a handful of ordinary application-code paths (roles, notifications, warehouses, payroll) where safety currently depends entirely on a tenant-scoped lookup happening earlier in the same function, with no structural lint/type-level enforcement that this ordering is preserved through future refactors. This is the exact bug shape that produced D-015 once already.
- DB-018 -- the large majority of Prisma relations rely on implicit onDelete/onUpdate defaults rather than explicit declarations; the defaults happen to be safe today, but a reviewer cannot see delete behavior in a schema diff without cross-referencing generated SQL.
- API-014 -- Swagger/OpenAPI is wired but has no per-route documentation (no ApiTags/ApiOperation on any of 28 controllers); functional but not useful as living documentation yet.
- SEC-005 / SEC-006 -- CORS_ORIGIN is a single string rather than a parsed allow-list (works today, will need a code change to support a second environment domain); argon2id parameters are implicit library defaults rather than pinned values (adequate today, would silently change on a future library upgrade with no diff to review).
- DB-009 -- several actor-reference fields (createdBy, inspectedBy, requestedBy, approvedBy) are unenforced strings rather than real foreign keys, a documented, deliberate D-005 trade-off for write-path cost that is nonetheless worth revisiting once write volume grows.
- FE-010/011/012 -- StatusBadge color-set coverage gaps, missing aria-labels on a handful of icon buttons, and missing Label/Input htmlFor pairing on roughly 10 manual-state forms: all mechanical, low-risk, low-cost cleanup items best batched with the FE-002 zod-migration/FE-008 form-standardization work rather than done as one-offs.
- PROD-006 -- 10 identical ESLint warnings (React Compiler skipping memoization on react-hook-form watch calls) that will keep growing one-per-new-form unless a conscious pattern decision is made.
- Frontend/backend enum-transition mismatch -- the frontend status-change dropdowns (FE-013) currently mirror the backend lack of transition rules exactly; once the backend gains real state-machine enforcement (Section 25), the frontend dropdowns should be updated in the same pass rather than left to silently offer choices the backend will now reject.

---

## 25. Recommended Completion Sequence

The fixes below are grouped by dependency, not just severity -- several P1 fixes are prerequisites for others, and doing them in the wrong order creates rework. Roughly sized for a small team; treat the sizing as relative ordering guidance, not a committed estimate.

### Phase 0 -- P0 fix pass (do first, narrowly scoped, no architecture change required)

1. TEN-001 -- scope the Quality Dashboard groupBy query to the caller tenant. Small, localized fix, highest business risk in the whole report.
2. RBAC-001 -- add a factoryId-membership check to every factory-scoped service (machines, employees, warehouses, production, attendance, downtime). Mechanical, repeated across roughly 6-8 services.
3. API-001 / API-002 / API-003 / API-004 / INV-001 (all non-atomic multi-write flows) -- fix once, architecturally: make InventoryService recordMovement and transferStock accept an optional transaction client, then wrap each of the four call sites (Goods Receipt, Dispatch, Batch Output, Material Consumption, Transfer) in a single prisma.db transaction. This is one pattern applied five times, not five separate designs.
4. DB-002 -- close the Stock uniqueness race: normalize null location/batchNumber to a sentinel value (or add partial unique indexes) so the constraint actually fires, and add the negative-stock guard from INV-002 in the same pass since both touch recordMovement.
5. DB-001 / DB-003 / DB-004 / DB-008 -- add deletedAt to ProductionBatch, GoodsReceipt, Dispatch, QualityInspection, PayrollPeriod, PurchaseOrder; change the Product/Material to StockMovement foreign keys to Restrict; route deletion through soft-delete going forward.
6. WF-015 -- make a REJECT/unresolved HOLD outcome actually block dispatch (query the latest inspection outcome for the batch before issuing stock) and stop recordBatchOutput from silently clearing HOLD (WF-008, same phase, same files).
7. FE-001 -- add an error state to DataTable and thread isError through the roughly 22 list-page queries. One shared-component change plus a mechanical per-page pass.

### Phase 1 -- State-machine and transaction-atomicity pass (the P1 list, mechanically similar work repeated per module)

8. Introduce a status-transition map per lifecycle (Sales, Purchase Order/Request, Production Order, Production Batch, Dispatch, Maintenance Job) and enforce it before every status write -- closes WF-001, WF-004, WF-007, WF-012, WF-017 using one pattern applied six times.
9. Segregation-of-duties on Purchase Order/Request approval (WF-005) and the Goods-Receipt-before-Quality-Check ordering fix (WF-006) -- these are Procurement-specific business-rule additions, do together since they touch the same service.
10. Preventive maintenance scheduling: link MaintenanceJob to MaintenanceSchedule, advance nextDueAt on completion, and stand up the first real apps/worker processor to run the periodic due-check (WF-018, WRK-001, WRK-004 partially -- natural to build together since this is the first concrete reason to make the worker real).
11. Close the remaining P1 audit-logging and idempotency gaps: API-005 (idempotency keys on document-creating endpoints), API-006 (audit-log manual inventory movements), INV-004 (make output warehouse effectively required).
12. Frontend: FE-002 (zod validation matching backend DTOs), FE-003 (wire ConfirmDialog to every status-changing action), FE-004 (searchable pickers instead of first-20-only dropdowns) -- do together, all touch the same form components.
13. RBAC-002 -- decide and implement whether Export/Print are real backend-enforced actions or documented UI-only concepts; either resolves the finding.
14. SEC-001 -- gate the mail dev-fallback behind NODE_ENV, stop logging the raw reset/invite URL even in dev.
15. PROD-001/002/003 -- stand up CI (mirroring the exact checks this audit ran by hand), Dockerfiles plus Nginx config, and a scheduled backup script. These three block any real deployment regardless of application-code readiness and can proceed in parallel with the phases above once someone is free for infra work.

### Phase 2 -- Test suite backfill (should run alongside Phases 0-1, not after)

16. Every P0/P1 fix above ships with its named regression test from Section 16 or the finding own Test-required field. Priority order matches Section 16: tenant-isolation and RBAC tests first, inventory-atomicity tests second, workflow-transition tests third.

### Phase 3 -- P2 pass (hardening, not blocking a pilot, but should land before broader rollout)

17. Database indexing (DB-013), remaining audit-logging gaps (API-015, WF-009/016/019), DTO validation bounds (API-008/009), frontend factory-filtering and search consistency (FE-005/006/007/008/009/013), refresh-token reuse-family revocation (AUTH-001), security headers on the frontend (SEC-002), Docker credential parameterization (SEC-003).

### Phase 4 -- P3 / technical debt (opportunistic, batch with adjacent work)

18. Everything in Section 21/24 -- mostly cheap, mechanical, and best absorbed into the same PRs as the related Phase 1-3 work (for example, fix FE-010/011/012 in the same PR as FE-002/003/004; fix DB-015/017/018 in the same PR as the Phase 0 schema changes).

### Explicitly deferred (not part of this roadmap, confirm scope with product owner)

19. Offline/PWA (Section 13) -- large, standalone body of work (service worker, IndexedDB, sync engine, conflict resolution) that the SRS places inside MVP scope (Section 20.2) but the project log treats as out of scope. Resolve the conflict before scheduling, since it changes whether this is Phase 0-3 work or genuinely deferred.
20. File attachments (Section 15.1) -- similarly sized standalone feature; MinIO infra already exists, application code does not.
21. Abyte AI -- correctly out of scope per the SRS own Phase 2 placement (Section 20.3); no action needed now.

---

## 26. Final Production Readiness Assessment

Build health: clean. prisma validate, apps/api tsc and eslint, apps/web tsc and eslint, and next build (29 routes) all pass with zero errors (10 non-blocking lint warnings, PROD-006). This confirms DEVELOPMENT_LOG.md own repeated compiles-and-lints-clean claims are accurate. It also confirms, independently, this project own standing lesson stated in that same log: compiling and linting clean has never been evidence that the system works correctly -- every P0 in this report compiles and lints cleanly today.

Deployability: not currently possible outside a developer machine. No CI/CD, no application Dockerfiles, no reverse-proxy/SSL configuration, no backup mechanism (PROD-001/002/003). This is independent of application-code readiness -- even if every P0/P1 finding above were fixed today, the application still could not be deployed to a VPS by following the SRS own described architecture, because none of that infrastructure layer exists yet.

SRS Section 22 MVP Acceptance Criteria -- walkthrough of all 25 items:

| # | Criterion | Status |
|---|---|---|
| 1 | A new tenant can be created | MET |
| 2 | Tenant users can be created | MET |
| 3 | Roles and permissions work as configured | PARTIAL -- RBAC-001 factory-access gap, RBAC-002 Export/Print gap |
| 4 | Cross-tenant access is impossible | FAILING -- TEN-001 confirmed live leak |
| 5 | Factories can be configured | MET |
| 6 | Warehouses can be configured | MET |
| 7 | Products and materials can be created | MET |
| 8 | Sales orders can be created | PARTIAL -- creation works, lifecycle integrity does not (WF-001/002) |
| 9 | Production orders can be generated | MET |
| 10 | Material can be consumed against a production order | PARTIAL -- functionally works, not atomic with stock (API-004) |
| 11 | Production output can be recorded | PARTIAL -- INV-004/API-003 gaps |
| 12 | Wastage can be recorded | MET |
| 13 | Machine downtime can be recorded | MET |
| 14 | Quality inspection can be performed | PARTIAL -- recording works, outcomes do not block anything (WF-015) |
| 15 | Inventory updates automatically from production and dispatch | PARTIAL -- works in the common path; INV-004 and non-atomic writes are real gaps |
| 16 | Maintenance jobs can be created | MET |
| 17 | Attendance can be recorded | MET |
| 18 | Basic costing can be calculated | PARTIAL/UNVERIFIED -- exists, formula fidelity not independently re-derived |
| 19 | Dashboards display operational data | PARTIAL -- real aggregations, one leaks cross-tenant (TEN-001) |
| 20 | Audit logs work correctly | PARTIAL -- good coverage on primary actions, several gaps (WF-009/016/019, API-006/015) |
| 21 | Selected workflows (production, quality, attendance) work offline | MISSING -- no offline capability exists at all |
| 22 | Offline transactions synchronize correctly | MISSING -- no sync engine exists |
| 23 | Database backups are automated | MISSING -- PROD-003 |
| 24 | Production monitoring is configured | MISSING -- PROD-004, no Sentry/APM |
| 25 | Critical security tests pass, including cross-tenant isolation | MISSING/FAILING -- zero automated tests exist, and the one thing they would test for (cross-tenant isolation) currently has a live confirmed failure |

Tally: 10 fully met, 9 partially met, 6 missing or actively failing.

Overall verdict: AbyteTex is a well-architected system with a genuinely sound core (tenant isolation design, inventory ledger pattern, RBAC model, audit-logging convention) that has not yet had its enforcement gaps closed or its infrastructure layer built. It is not production-ready and not yet safe for a pilot-factory rollout in its current state, primarily because of the confirmed cross-tenant leak (TEN-001) and the complete absence of both automated tests and any deployment mechanism -- not because the underlying architecture needs to be rethought. The Phase 0 fix list (Section 25) is narrow, well-understood, and does not require new architectural decisions; completing it, together with a working CI pipeline and the Phase 2 test backfill running alongside it, is the realistic gate before any real tenant data should be trusted to this system.
