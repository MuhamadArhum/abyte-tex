# AbyteTex — System Guide

## Overview

AbyteTex is a multi-tenant SaaS platform for managing textile manufacturing
businesses end-to-end: sales orders, procurement, production (process routes,
production orders/batches, material consumption), inventory/stock ledger,
quality inspections, machine/downtime tracking, preventive & corrective
maintenance, dispatch/logistics, costing, HR (employees, shifts, attendance,
payroll), notifications, and owner/production/inventory dashboards. It is
built as a monorepo with a NestJS REST API backend, a Next.js frontend, a
shared PostgreSQL database (via Prisma), Redis (for queues/BullMQ), and MinIO
(S3-compatible object storage) for file assets. Tenancy, RBAC (16 roles / 8
actions), auditing, and idempotency are enforced centrally in the API.

## Tech Stack

- **Language:** TypeScript throughout (backend, frontend, and shared packages).
- **Backend:** NestJS 10.4.x (`@nestjs/core`, `@nestjs/common`, `@nestjs/config`,
  `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/platform-express`,
  `@nestjs/swagger`, `@nestjs/throttler`, `@nestjs/bullmq`), running on Node.js
  (engines require `>=20.0.0`).
- **Frontend:** Next.js 16.3.5 (App Router), React 19.2.8, Tailwind CSS 4,
  TanStack Query 5, Zustand 5, React Hook Form 7 + `@hookform/resolvers`,
  `@base-ui/react`, `shadcn`, `lucide-react`, `next-themes`, `sonner`.
- **Validation:** Zod 3.23.x (used both in the API and in the shared
  `@abytetex/validation` package).
- **ORM / DB driver:** Prisma 5.20–5.22 (`@prisma/client`, `prisma` CLI) against
  PostgreSQL.
- **Auth:** JWT access tokens + rotating opaque refresh tokens (httpOnly
  cookie), `argon2` for password hashing, `passport-jwt`.
- **Queueing:** BullMQ 5.21.x backed by Redis (`@nestjs/bullmq`).
- **Object storage:** S3-compatible client against MinIO (local dev) — see
  `S3_*` env vars.
- **Mail:** `nodemailer` (SMTP; falls back to logging when unset).
- **Testing:** Jest 29 + `ts-jest` + `supertest` (API unit + e2e tests under
  `apps/api/test/p0`, `apps/api/test/p1`).
- **Tooling:** ESLint, Prettier, npm workspaces, TypeScript 5.6.

## Architecture & Modules

This is an **npm-workspaces monorepo** (`workspaces: ["apps/*", "packages/*"]`),
not a single monolith and not fully separate repos — one repo, multiple apps
sharing common packages.

### `apps/api` — NestJS backend (the REST API)
Feature modules live under `apps/api/src/<module>` and are wired into
`apps/api/src/app.module.ts`. Each corresponds to a business domain:

- `auth` — login/logout, JWT + refresh-token rotation, change/forgot/reset
  password, login history.
- `tenants` — platform-level tenant (company) provisioning and management.
- `users` / `roles` — tenant user management; 16-role RBAC catalog, 8-action
  permission model, per-user overrides, per-factory access.
- `factories`, `departments`, `warehouses` — master configuration data
  (factories, departments, warehouses/locations).
- `products`, `materials`, `customers`, `suppliers` — commercial/master data
  (product catalog, raw materials, customers, suppliers).
- `shifts`, `machines`, `employees`, `attendance` — workforce & machine master
  data and attendance tracking.
- `sales` — sales quotations and sales orders.
- `procurement` — purchase requests, purchase orders, goods receipts.
- `inventory` — the single source of truth for stock (`Stock`,
  `StockMovement`); all other modules (procurement, production, dispatch) go
  through `InventoryService.recordMovement()` / `transferStock()` rather than
  writing stock rows directly.
- `production` — process routes, production orders, production batches,
  material consumption.
- `downtime` — machine downtime logging; auto-creates corrective
  `MaintenanceJob`s for mechanical/electrical breakdowns.
- `quality` — inspection templates, quality inspections, defects.
- `maintenance` — maintenance jobs and preventive maintenance schedules.
- `dispatch` — outbound dispatch against sales orders.
- `costing` — cost sheets.
- `payroll` — payroll periods/entries, incentives.
- `notifications` — in-app notifications.
- `dashboards` — aggregation queries for Owner/Production/Inventory dashboards.
- `audit` — `AuditService`, writes an audit trail on meaningful mutations.
- `mail` — SMTP-backed mail service (logs instead of sending if SMTP env vars
  are unset).
- `common` — shared guards (`JwtAuthGuard`, `PermissionsGuard`), RBAC
  constants, filters, interceptors (tenant-context AsyncLocalStorage,
  response envelope), idempotency handling.
- `prisma` — `PrismaService`/`PrismaModule`, wraps Prisma Client with a tenant
  auto-injection extension.
- `config` — env validation (Zod schema) and typed configuration builder.
- `health` — health check endpoint.

API is versioned under `/api/v1` (global prefix `api` + URI versioning,
default version `1`); Swagger/OpenAPI UI is served at `/api/docs` in
non-production environments.

### `apps/web` — Next.js frontend
- `src/app/(auth)/...` — login, forgot/reset password pages.
- `src/app/(dashboard)/...` — one route segment per business area: attendance,
  costing, customers, dispatches, downtime, employees, factories, inventory,
  machines, maintenance, materials, payroll, production-orders, products,
  purchase-orders, quality, roles, sales, settings, suppliers, tenants, users.
- `src/features/<domain>` — feature-specific logic/components mirroring the
  backend modules (attendance, costing, customers, dashboards, dispatch,
  downtime, employees, factories, inventory, machines, maintenance, materials,
  notifications, payroll, procurement, production, products, quality, roles,
  sales, settings, shifts, suppliers, tenants, users).
- `src/components`, `src/hooks`, `src/lib` (includes `api-client.ts`, the
  fetch wrapper that talks to the API and handles access-token refresh),
  `src/store` (Zustand auth store).
- Note: `apps/web/AGENTS.md` warns that this Next.js version (16.3.5) has
  breaking changes vs. older Next.js conventions — consult
  `node_modules/next/dist/docs/` before assuming standard Next.js behavior.

### `apps/worker` — background worker (placeholder)
`apps/worker/src` exists but is empty, and there is **no `package.json`** in
`apps/worker`. The root `package.json` has a `dev:worker` script that
references it as an npm workspace, but since it has no `package.json` it is
not currently a real, runnable workspace. Treat this as scaffolded but
unimplemented.

### `packages/` — shared code
- `packages/types` — shared TypeScript types (RBAC enums, API envelope
  types), published as raw TS source (no build step needed for consumption;
  Next.js transpiles it directly per `transpilePackages` in
  `apps/web/next.config.ts`).
- `packages/validation` — shared Zod schemas (e.g., auth forms).
- `packages/config` — present as a workspace folder; no distinct package.json
  content was found beyond the workspace glob (see Notes).

### `prisma/` — database schema, migrations, seed
Root-level `prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`,
shared by the API (not nested under `apps/api`).

## Database

- **Type:** PostgreSQL (`postgres:16-alpine` in `docker-compose.yml`).
- **ORM:** Prisma 5.x (`prisma/schema.prisma`), single database, multi-tenant
  via a `tenantId` column on tenant-scoped models plus a Prisma Client
  extension that auto-injects `tenantId` (enforced in `apps/api/src/prisma`,
  not at the database level).
- **Connection config:** `DATABASE_URL` in the root `.env` (and `.env.example`),
  consumed by `prisma/schema.prisma`'s `datasource db` block and by
  `apps/api/src/config`.
- **Redis:** used for BullMQ queues, connection via `REDIS_URL` (root `.env`);
  provided locally by the `redis` service in `docker-compose.yml`.
- **Object storage:** MinIO (S3-compatible), configured via `S3_*` env vars,
  provided locally by the `minio` service in `docker-compose.yml`.
- **Key models** (≈57 total in `prisma/schema.prisma`), grouped by domain:
  - Platform/tenancy: `Tenant`, `User`, `LoginHistory`, `RefreshToken`,
    `PasswordResetToken`, `Role`, `Permission`, `UserRole`,
    `UserPermissionOverride`, `UserFactoryAccess`.
  - Master data: `Factory`, `Department`, `Warehouse`, `Location`, `Shift`,
    `Customer`, `Supplier`, `ProductCategory`, `Product`, `Material`.
  - Commercial: `SalesQuotation`(+`Item`), `SalesOrder`(+`Item`),
    `PurchaseRequest`(+`Item`), `PurchaseOrder`(+`Item`), `GoodsReceipt`(+`Item`).
  - Production: `ProcessRoute`(+`Stage`), `ProductionOrder`, `ProductionBatch`,
    `MaterialConsumption`.
  - Machines/quality/maintenance: `Machine`, `MachineLog`, `Downtime`, `Stock`,
    `StockMovement`, `Dispatch`(+`Item`), `InspectionTemplate`,
    `QualityInspection`, `Defect`, `MaintenanceJob`, `MaintenanceSchedule`.
  - Workforce/finance: `Employee`, `Attendance`, `Incentive`,
    `PayrollPeriod`, `PayrollEntry`, `CostSheet`.
  - Platform services: `Notification`, `FileAsset`, `AuditLog`, `SyncEvent`,
    `IdempotencyKey`.

## Location

- Repo root: `D:\abyte-tex`
- Backend: `D:\abyte-tex\apps\api`
- Frontend: `D:\abyte-tex\apps\web`
- Worker (unimplemented placeholder): `D:\abyte-tex\apps\worker`
- Shared packages: `D:\abyte-tex\packages\types`, `D:\abyte-tex\packages\validation`, `D:\abyte-tex\packages\config`
- Database schema/migrations: `D:\abyte-tex\prisma`

## Ports

This app has a genuine separate frontend and backend, so both ports were assigned:

- **Backend (NestJS API):** `3012` — set via `API_PORT` in `D:\abyte-tex\.env`
  and `.env.example`; consumed in `apps/api/src/config/env.validation.ts`
  (default also updated to `3012`) and `apps/api/src/config/configuration.ts`
  → used by `app.listen(port)` in `apps/api/src/main.ts`. API is reachable at
  `http://localhost:3012`, with routes under `/api/v1/...` and Swagger docs at
  `/api/docs` (non-production only).
- **Frontend (Next.js):** `5185` — set via the `-p 5185` flag added to the
  `dev` and `start` scripts in `apps/web/package.json`, and via `PORT=5185`
  added to the root `.env`/`.env.example` (Next.js also honors the `PORT` env
  var if the flag were ever removed).

Unrelated shared infrastructure ports (PostgreSQL `5432`, Redis `6379`, MinIO
`9000`/`9001` in `docker-compose.yml`) were intentionally left unchanged —
these are shared local dev services, not this app's own HTTP servers.

## Environment Variables

Defined in the root `.env` (git-ignored) / `.env.example` (template, safe to
commit — no real secrets):

- `DATABASE_URL` — PostgreSQL connection string (Prisma).
- `REDIS_URL` — Redis connection string (BullMQ).
- `JWT_ACCESS_SECRET`, `JWT_ACCESS_EXPIRES_IN` — access token signing secret/TTL.
- `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN` — refresh token signing secret/TTL.
- `API_PORT` — backend HTTP port (now `3012`).
- `API_URL` — backend's own base URL (now `http://localhost:3012`).
- `CORS_ORIGIN` — allowed origin for the API's CORS policy (now
  `http://localhost:5185`, matching the frontend port).
- `NODE_ENV` — `development` / `test` / `production`.
- `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` — MinIO/S3 object storage config.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` — mail
  config; if `SMTP_HOST` is unset, `MailService` logs instead of sending.
- `PORT` — frontend port (now `5185`; also passed explicitly via `-p` in the
  npm scripts).
- `NEXT_PUBLIC_API_URL` — frontend's base URL for calling the API (now
  `http://localhost:3012/api/v1`); also duplicated in `apps/web/.env.local`
  and as a hardcoded fallback in `apps/web/src/lib/api-client.ts` (both
  updated to `3012`).
- `PLATFORM_SUPER_ADMIN_EMAIL`, `PLATFORM_SUPER_ADMIN_PASSWORD` — used only by
  `prisma/seed.ts` to bootstrap the platform super admin.

`apps/api/src/config/env.validation.ts` (Zod schema) fails startup fast if a
required variable is missing/malformed.

## How to Run

1. **Install dependencies** (run once, from the repo root — installs all
   workspaces):
   ```
   npm install
   ```
2. **Start local infrastructure** (Postgres, Redis, MinIO):
   ```
   docker compose up -d
   ```
3. **Set up environment:** copy `.env.example` to `.env` at the repo root if
   you don't already have one, and fill in real secret values (the port
   values are already set correctly for this app: `API_PORT=3012`,
   `PORT=5185`).
4. **Generate Prisma client / run migrations:**
   ```
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```
5. **Run the backend in dev mode** (NestJS, watches for changes, on port 3012):
   ```
   npm run dev:api
   ```
6. **Run the frontend in dev mode** (Next.js, on port 5185), in a separate
   terminal:
   ```
   npm run dev:web
   ```
   (equivalently: `cd apps/web && npm run dev`, which now runs `next dev -p 5185`)
7. **Build for production** (builds shared packages, then API, then web):
   ```
   npm run build
   ```
8. **Start in production mode**, in separate processes:
   ```
   npm run start --workspace=apps/api    # runs node dist/main, reads API_PORT (3012)
   npm run start --workspace=apps/web    # runs next start -p 5185
   ```
9. `npm run dev:worker` exists in the root `package.json` but currently has
   nothing to run against (see Notes).

## Notes

- **Worker app is unimplemented:** `apps/worker/src` is an empty directory
  with no `package.json`. The root `dev:worker` script will fail until this
  workspace is actually scaffolded (a `package.json` with a `start:dev`
  script needs to be added). Left as-is per instructions (no dependency
  installs, no scaffolding beyond the port/config task).
- **`packages/config` workspace:** the folder exists (matches the
  `packages/*` workspace glob) but no distinct feature content beyond that
  was inspected in depth; if you rely on it, verify its `package.json`
  directly.
- **Frontend port propagation:** Next.js picks up the port from the `-p` CLI
  flag added to `dev`/`start` in `apps/web/package.json`; the `PORT=5185`
  env var was also added to the root `.env`/`.env.example` as a fallback/
  documentation aid, but the CLI flag is what actually takes effect for
  `npm run dev:web` / `npm run dev --workspace=apps/web`.
- **CORS:** `CORS_ORIGIN` in `.env`/`.env.example` was updated from
  `http://localhost:3000` to `http://localhost:5185` so the API accepts
  requests from the frontend's new port. If you deploy the frontend to a
  different origin, update `CORS_ORIGIN` accordingly.
- **`.env` secrets preserved:** only the port-related keys
  (`API_PORT`, `API_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`, and the newly
  added `PORT`) were changed in the existing root `.env`. All other existing
  values (DB credentials, JWT secrets, S3 credentials, etc.) were left
  untouched.
- **Extensive existing documentation** already lives at the repo root and was
  not duplicated here in full — see `ABYTETEX_COMPLETE_SYSTEM_AUDIT.md`,
  `DEVELOPMENT_LOG.md`, `IMPLEMENTATION_DECISIONS.md`,
  `REQUIREMENTS_TRACEABILITY.md`, `P0_REMEDIATION_REPORT.md`, and
  `P1_BUSINESS_WORKFLOW_REMEDIATION_REPORT.md`, plus `AbyteTex_SRS_v1.0.docx`
  (the original SRS). This guide summarizes what was found directly in code
  and config; consult those files for deeper historical/design rationale.
- **No automated port-conflict check was run** — starting the app was
  explicitly out of scope for this task, so the new ports (3012, 5185) have
  not been verified free on this machine at runtime.
