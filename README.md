# POS Eye

POS Eye is a configurable POS workspace built with React, Express, Prisma, and PostgreSQL. This repository contains an initial implementation of the core catalog-to-sale workflow. See [implementation status](docs/architecture.md#implementation-status) before planning a deployment.

## Local setup

Use Node.js 22.12+ or 24 LTS and Docker Compose, or a PostgreSQL server you manage. On Windows, use `npm.cmd` and `npx.cmd` if PowerShell blocks npm scripts.

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
```

If using an existing PostgreSQL instance, create a dedicated database and set `DATABASE_URL` in `.env`. Keep the frontend origin on `127.0.0.1:5173` or update `APP_ORIGIN` to match. Start the API and web client in separate terminals.

```powershell
npm.cmd run api
npm.cmd run dev -- --strictPort
```

Open `http://127.0.0.r1:5173/setup`. Create your first admin and business, add a product, receive opening stock in Inventory, and create a cashier membership. At checkout, select items, review the server quote, enter cash tendered, and complete the sale. The receipt PDF uses the configured thermal width. Print it from a PDF viewer using your printer driver and the matching paper size.

### Optional demo data

Set `ALLOW_DEMO_SEED=true` in `.env` and run `npm.cmd run db:seed` against a development database. The seeded businesses and accounts are marked as demo. Use these development-only sign-ins.

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@omnipos.test | OmniPOS-demo-admin! |
| Staff | cashier@omnipos.test | OmniPOS-demo-staff! |

Production rejects demo accounts and memberships in demo businesses. Use a separate production database, disable demo seeding, set `ALLOW_SIGNUP=false` after provisioning, and serve the built frontend and API over the same HTTPS origin. Set `NODE_ENV=production` only when HTTPS is available, since the session cookie then requires it.

## Checks

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd test
$env:RUN_POS_INTEGRATION='true'
node --env-file=.env --import tsx --test tests/integration.test.ts
npx.cmd playwright install chromium
npm.cmd run e2e
```

The integration and browser tests create isolated businesses and leave their rows in the database. Use a disposable, migrated test database with signup enabled, and run them without demo credentials or production data.

[Architecture](docs/architecture.md) · [API reference](docs/api.md) · [Implementation plan](docs/implementation-plan.md)

## PostgreSQL smoke checks

After applying the migrations to a local test database, run `psql -X -v ON_ERROR_STOP=1 -f tests/schema-smoke.sql` using the test database connection. The script rolls back its fixtures. It checks tenant-scoped foreign keys, duplicate checkout keys, available-stock deductions, and sale-time price snapshots.
