# Requirements Traceability

Maps SRS requirements to implementation and test status. Updated as each module lands — not a one-time snapshot. `Status` values: `Done` (implemented, compiles/lints clean), `Partial`, `Not started`. `Test` is empty until a real automated or manual test exists — "the code exists" is not "it's tested."

| # | Requirement (SRS §) | Implementation | Status | Test |
|---|---|---|---|---|
| 1 | Multi-tenant architecture, single DB, strict isolation (§3) | `prisma/schema.prisma` (Tenant model + tenantId on every scoped model), `apps/api/src/prisma/prisma.service.ts` (auto-scoping extension), `tenant-context.ts`, `TenantContextInterceptor` | Done | **Manually verified** 2026-09-12 against a live Postgres: tenant user 403's on platform routes, platform admin 403's on tenant routes (does not silently see tenant data — this specific failure mode was caught and fixed, see DEVELOPMENT_LOG + D-015). No automated test yet. |
| 2 | Role hierarchy, RBAC (§4.1, §4.2) | `apps/api/src/common/rbac.constants.ts`, `roles/role-seed.util.ts`, `roles/*`, `PermissionsGuard` | Done | **Manually verified**: all 14 tenant roles seeded correctly on tenant creation; a VIEWER-role user can VIEW but gets 403 on CREATE. No automated test yet. |
| 3 | Login/logout, password reset/change, session mgmt (§5.1) | `apps/api/src/auth/*` | Done | **Manually verified**: login with correct/incorrect password, full invite→reset-password→login cycle (a real bug — reset not activating INVITED accounts — was caught and fixed here). Change-password, refresh-token rotation, and forgot-password not yet independently exercised. |
| 4 | Factory access management (§5.1) | `UserFactoryAccess`, `users/*` | Done | Not yet exercised (invite-with-factoryIds path untested) |
| 5 | Company management / settings (§5.2) | `tenants/tenants.service.ts` (`getOwnTenant`/`updateOwnTenant`) | Done | Not yet exercised |
| 6 | Factory management, multi-factory (§5.3) | `factories/*`, `departments/*` | Done | Factories: **manually verified** (list/create/tenant-scoping). Departments: not yet independently exercised (same code pattern). |
| 7 | Warehouse mgmt, Warehouse→Location→Rack→Bin (§5.3, §8.2) | `warehouses/*` (+ `Location` model) | Done | Not yet exercised |
| 8 | Master data: products, materials, customers, suppliers (§5.4) | `products/*` (+ product categories), `materials/*`, `customers/*`, `suppliers/*` — full CRUD, tenant-scoped, RBAC-gated, audited | Done (API) — no frontend UI yet | **Manually verified** 2026-09-12: created a category, a product (with category join), a material, a customer, and a supplier against the live demo tenant; duplicate-SKU correctly rejected with 409. No automated test yet. |
| 9 | Sales management, SO status flow (§6.1) | `SalesOrder`/`SalesOrderItem`/`SalesQuotation` schema models | Partial — schema only | Not started |
| 10 | Procurement workflow (§6.2) | `PurchaseRequest`/`PurchaseOrder`/`GoodsReceipt` schema models | Partial — schema only | Not started |
| 11 | Production management, process routes, batches (§7.1–§7.4) | `ProductionOrder`/`ProductionBatch`/`ProcessRoute`/`MaterialConsumption` schema models | Partial — schema only | Not started |
| 12 | Loom/machine management, statuses (§7.5) | `Machine` schema model | Partial — schema only | Not started |
| 13 | Machine production tracking (§7.6) | `MachineLog` schema model | Partial — schema only | Not started |
| 14 | Downtime management, categories (§7.7) | `Downtime` schema model | Partial — schema only | Not started |
| 15 | Inventory ops, traceability (§8.1, §8.3) | `Stock`/`StockMovement` schema models | Partial — schema only | Not started |
| 16 | Dispatch management (§8.4) | `Dispatch`/`DispatchItem` schema models | Partial — schema only | Not started |
| 17 | Quality control, textile fields, outcomes (§9.1) | `QualityInspection`/`Defect`/`InspectionTemplate` schema models | Partial — schema only | Not started |
| 18 | Quality traceability chain (§9.2) | Schema relations support the chain (SalesOrder→ProductionOrder→Batch→Machine→QualityInspection) | Partial — schema only, no report endpoint | Not started |
| 19 | Maintenance (corrective + preventive) (§9.3) | `MaintenanceJob`/`MaintenanceSchedule` schema models | Partial — schema only | Not started |
| 20 | HR: employee profiles (§10.1) | `Employee` schema model | Partial — schema only | Not started |
| 21 | Attendance tracking (§10.2) | `Attendance` schema model | Partial — schema only | Not started |
| 22 | Payroll inputs (§10.3) | `PayrollPeriod`/`PayrollEntry`/`Incentive` schema models | Partial — schema only | Not started |
| 23 | Costing (§11) | `CostSheet` schema model | Partial — schema only | Not started |
| 24 | Dashboards (§12.1–§12.6) | Not started | Not started | Not started |
| 25 | Notifications, in-app + email (§12.7) | `Notification` schema model, `MailService` (email transport) exists; no notification-creation triggers yet | Partial | Not started |
| 26 | Offline capability + sync (§13) | `SyncEvent` schema reserved (D-011); no PWA/service worker/IndexedDB/sync engine | Not started — deliberately deferred to its roadmap phase | Not started |
| 27 | Abyte AI (§14) | Out of scope for now (D-012, Phase 2 per SRS) | Not started | Not started |
| 28 | File management, object storage (§15.1) | `FileAsset` schema model; MinIO wired in `docker-compose.yml`; no upload endpoint yet | Partial | Not started |
| 29 | Audit logs (§15.2) | `AuditService`, called from auth/tenants/users/factories/departments/warehouses/roles | Done for Phase 1 modules; not yet wired into modules that don't exist yet | Not yet |
| 30 | Security requirements (§16.1) | HTTPS via Nginx (not yet configured — no infra/nginx conf written), argon2 hashing, RBAC, tenant isolation, input validation (class-validator + whitelist), rate limiting, secure cookies, audit logging | Partial — app-layer done, infra (HTTPS termination, secrets management for production) not yet built | Not yet |
| 31 | Performance: pagination, indexing (§16.2) | `PaginationQueryDto` used on all list endpoints; indexes on tenantId/FKs throughout schema | Done for what exists | Not yet |
| 32 | Scalability (§16.3) | Stateless API design (no in-process session state beyond request-scoped ALS context); Redis/BullMQ wiring pending | Partial | Not started |
| 33 | Database architecture, design rules (§17.1, §17.2) | Full schema; FKs/indexes/unique constraints throughout; soft delete where decided (D-009) | Done | Verified via `prisma validate`/`generate` only |
| 34 | Backend: NestJS/TS, module domains (§17.3) | `apps/api` structure matches | Done for Phase 1 modules | — |
| 35 | Frontend: Next.js/TS/Tailwind/shadcn/TanStack/Zustand (§17.4) | Not started | Not started | Not started |
| 36 | Infrastructure: Docker, Nginx, GitHub Actions (§17.5) | `docker-compose.yml` for local dev only; no production Dockerfiles, no `infra/nginx` conf, no CI workflow yet | Partial | Not started |
| 37 | Backup strategy (§17.6) | Not started | Not started | Not started |
| 38 | API standards: REST, /api/v1, DTOs, Swagger (§17.7) | `main.ts` (URI versioning), global ValidationPipe, Swagger at `/api/docs` | Done | — |
| 39 | Testing requirements (§18) | No automated tests written yet | Not started | Not started |
| 40 | Repository structure (§19) | Matches | Done | — |
| 41 | MVP acceptance criteria (§22) | Tenant creation ✅ manually verified, tenant users ✅ manually verified, roles/permissions ✅ manually verified, cross-tenant access is impossible ✅ manually verified (in both directions — see row 1), factories ✅ manually verified, warehouses configured (implemented, not yet independently exercised) — the rest (products, sales orders, production, inventory auto-update, quality, maintenance, attendance, costing, dashboards, offline, backups, monitoring) not started | Partial | Manually verified for the items marked ✅ above; no automated tests exist yet for any of them |

**Bottom line:** Phase 1 (Foundation per SRS §20.1 — project setup, auth, multi-tenancy, RBAC, database, audit, UI system) is implemented, compiles/lints clean, **and has now been run against a real local Postgres and manually exercised over HTTP** — which caught and fixed two real bugs (broken tenant-context propagation, and a cross-tenant data leak through a platform-admin bypass) that no static check had surfaced. What's still missing for Phase 1: automated tests (everything above was verified by hand, not by a test suite that will catch a regression), and independent verification of departments/warehouses/locations, role-permission editing, refresh-token rotation, and forgot-password. Phase 2 onward (master data APIs/UI, commercial/production/inventory/quality/maintenance/HR/costing modules, dashboards, offline, frontend entirely) has schema support but no API, UI, or tests.
