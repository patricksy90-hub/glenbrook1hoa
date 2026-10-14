# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## App: Glenbrook 1 HOA Management System

Full-stack HOA management platform with admin and resident portals.

**Implemented modules:**
- Homeowner & Property Management
- Dues Billing, Mass Invoice, GCash QR & PayMongo payments, Proof-of-payment workflow
- Visitor Tracking with QR codes, RFID Tags
- Service Expenses (AP), Asset Inventory
- Double-Entry Bookkeeping: Chart of Accounts, Journal Entries, Financial Reports
- Announcements, User Management, HOA Settings
- **Violations & Fine Management** — log violations per homeowner, fine/pay/waive/appeal workflow, stats dashboard
- **Delinquency Aging Report** — aging buckets (30/60/90+ days) per homeowner, derived from dues table
- **Household Members** — sub-records per homeowner (spouse, children, parents, tenants, caregivers); managed via dialog from Homeowners page; fields: name, relationship, birthdate, sex, occupation, phone, email, government ID type/number, notes; inline edit; color-coded relationship badges; cascade-deletes with homeowner
- **Security Deployment** — tracks security agencies (name, address, contact, PNP-SOSIA license, contract dates) and deployed guards per agency; guard fields: full name, license number, phone, address, start/end dates, shift schedule (from/to), status (active/on_leave/inactive), firearm (make, caliber, serial number), motorcycle (make, color, plate); stats dashboard; Guards/Agencies tabs with Add/Edit/Delete
- **My Household (Owner/Renter Portal)** — homeowners can self-manage their household roster at `/my-household`; add/edit/delete family members (spouse, children, parents, siblings, tenants, caregivers); grouped by relationship with color-coded badges; card layout with avatar initials, contact info, birthdate/sex, occupation, and government ID details
- Role-based access: admin / owner / renter portals
- **Accounting Architecture (Refactored)** — `payments` table (immutable event log per dues invoice), `vendor_payments` table (per vendor bill), `system_audit_logs` (append-only trail for all actions); dues/expense statuses are auto-computed from payment totals — never set directly via API; proof-of-payment review workflow (admin approve/reject); GCash QR + PayMongo online link; audit log records every payment event with actor email and human-readable notes
- **Ledger Impact subtab** — every transaction automatically creates a double-entry journal entry (DR/CR); viewable via a "Ledger Impact" subtab on dues invoice rows, expense rows; violations with fines show a ledger button (indigo BookOpen icon) opening a modal; Single Invoice shows the JE immediately after creation; Mass Invoice shows a collapsible consolidated JE on the done screen. API: `GET /api/journal-entries/by-ref/:ref` looks up by referenceNo. Expenses: DR 5xxx expense account / CR 2000 AP. Violations (fineAmount > 0): DR 1100 AR / CR 4100 Penalty Income.
- **Move In / Move Out** — homeowners and renters submit move-in/move-out applications via `/move-applications`; form captures: application type (move_in/move_out), date/time, vehicle details (type, plate, driver), moving company/helpers info, move-out clearance acknowledgments (3 checkboxes: no dues, no violations, unit cleared — only shown for move-out), and terms acceptance; staff (admin, admin_support, security_guard) see all applications with search/filter and can update status (pending → approved → completed/cancelled) via inline panel; DB: `move_applications` table; API: `GET /api/move-applications` (staff), `POST/GET /api/my/move-applications` (owner), `PATCH /api/move-applications/:id/status`, `POST /api/homeowners/:id/move-applications` (staff create)
- **Global Search** — `GET /api/search?q=...` searches 8 entities (homeowners, invoices, violations, expenses, home improvements, visitors, assets, announcements); debounced ⌘K shortcut triggers the search overlay in the top header; results grouped by category with status badges and amounts; keyboard navigation (arrow keys + Enter + Escape)

**Auto-seeded test accounts (created on every server startup, idempotent):**
| Role           | Email                           | Password        |
|----------------|---------------------------------|-----------------|
| admin          | admin@hoa.local                 | (ADMIN_PASSWORD secret) |
| admin_support  | admin.support@hoa.local         | Welcome@123     |
| accountant     | test@test.com                   | Welcome@123     |
| security_guard | security@hoa.local              | Welcome@123     |
| owner          | owner@hoa.local                 | Welcome@123     |
| renter         | cynthia.villanueva@email.com    | Welcome@123     |

Demo homeowner accounts (created only after running seed-demo): Welcome@123

**Seed demo data:** POST /api/admin/seed-demo (admin session required)

## Security Architecture

- **Home Improvement / Renovation Workflow** — owners (role: owner/renter) apply via `/home-improvements` page (self-service `POST /my/home-improvements`); form captures applicant type (homeowner/representative/tenant), improvement types (multi-select: house_renovation/extension/interior/fence_gate/roofing/electrical/plumbing/painting/others), work description, construction schedule (start/completion/est. days), contractor/workers info, and documents checklist (6 boolean items); staff create directly (status=approved); approvers (admin, admin_support, accountant) review via `POST /homeowners/:id/home-improvements/:id/review` (approve/disapprove + optional remarks); all pending applications visible in Access Applications page under "Home Improvements" tab; **Document Upload** — each application has a paperclip button opening a DocumentsPanel dialog for uploading/downloading/deleting actual files (base64-encoded in DB, `home_improvement_documents` table); **Extended Status Flow** — approved → active (in progress) → completed / suspended; staff update status via `PATCH /homeowners/:id/home-improvements/:id/status` which also sets bondAmount, penaltyIncurred, remarks; **Work Permits module has been fully removed** (migrated into Home Improvements); DB: `home_improvements` table with `bond_amount`, `penalty_incurred` columns; `home_improvement_documents` table; API: `GET /api/home-improvements`, `GET/POST /api/home-improvements/:id/documents`, `GET/DELETE /api/home-improvements/documents/:docId`, `GET /api/home-improvements/documents/:docId/download`
- **RFID & Car Sticker Approval Workflow** — owners (role: owner/renter) apply for RFID tags and car stickers via the `/rfid` page (self-service view limited to 2 each, `status=pending_approval`, `appliedByOwner=true`); approvers (admin, admin_support, accountant) see Approve/Reject buttons in the homeowner RFID/Car Sticker dialogs; `requireApprover` middleware gates review endpoints (`POST /homeowners/:id/rfid/:id/review`, `POST /homeowners/:id/car-stickers/:id/review`); owner self-service endpoints: `GET/POST /my/rfid`, `GET/POST /my/car-stickers`; DB: `status`, `appliedByOwner`, `rejectionReason`, `reviewedAt`, `reviewedByUserId` added to both tables; **Validity dates** — approvers must enter `validFrom` and `validUntil` (required for approval); for RFID tags these are stored in `valid_from`/`valid_until` columns; for car stickers they map to existing `issued_date`/`expiry_date` columns; displayed in green on both owner and admin views after approval; vehicle plate (`vehicle_plate`) required for RFID applications by owners; **Mandatory Document Upload** — all three owner application flows (RFID, car sticker, home improvement) require at least one supporting document before submitting; documents stored as base64 in `rfid_documents`, `car_sticker_documents`, `home_improvement_documents` tables; shared `FileAttachmentSection` component (`src/components/FileAttachmentSection.tsx`) used across all forms; **Car Sticker Guidelines** — two-page policy document modal (StickerGuidelinesModal) is shown as a required pre-step before the car sticker application form; standalone "Guidelines" button also always visible in the section header
- **Auth middleware** — `artifacts/api-server/src/middlewares/auth.ts` provides `requireAuth`, `requireStaff`, `requireAdmin`, `requireAdminOrSupport`, `requireApprover`, and `loadSessionRole`
- **Session** — `userId` + `userRole` stored in session on login/register; `loadSessionRole` backfills role for existing sessions
- **Route protection** — all write/sensitive routes require `requireStaff` or `requireAdmin` middleware
- **Admin password** — hashed from `ADMIN_PASSWORD` secret at startup; never hardcoded
- **Session secret** — fails fast in production if `SESSION_SECRET` env var is missing

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── hoa-tracker/        # React/Vite HOA web application
│   └── mockup-sandbox/     # Isolated component/design previews
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── audit-labels/       # Shared audit action labels
│   ├── designation/        # Shared ID designation labels and tiers
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace package discovery and dependency catalog
├── tsconfig.base.json      # Shared strict TS options (bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every TypeScript package extends `tsconfig.base.json`. Shared libraries opt into `composite: true` and are listed in the root `tsconfig.json`; consuming artifacts reference their shared-library dependencies. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`. It builds shared-library declarations first, then checks each artifact and the scripts package.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — builds shared-library declarations and typechecks every artifact and script package

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.mjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, use `pnpm --filter @workspace/db run push`. Post-merge setup runs this in non-interactive CI mode and fails visibly if a change needs manual review; it never truncates data or forces through a conflicting schema change.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
