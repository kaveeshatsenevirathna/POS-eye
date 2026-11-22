# Architecture

The React app uses TanStack Query for server state and Zustand for the current and held baskets. Express owns authentication, authorization, validation, payments, and financial calculations. PostgreSQL is the persistent system of record. Prisma maps the relational schema. The Vite proxy keeps development HTTP requests same-origin and the production API serves the built web app.

## Authorization and data ownership

The browser presents an opaque HTTP-only session cookie and a business selector. The server hashes the cookie token before lookup and checks the active membership and role. Business resource lookups include the membership business ID. Composite foreign keys constrain category references and order items, payments, and refunds to their business. Staff sale history and receipts are limited to the signed-in cashier. State-changing browser requests require the configured Origin.

## Sales and reporting

A checkout takes product IDs, quantities, a discount percentage, and payment tenders. The server reads active products and the current settings, computes decimal totals, and commits the sale, snapshots, payments, and stock movements in a serializable transaction. Conditional stock decrements guard the balance. The tenant-scoped idempotency key is tied to the cashier and request fingerprint. Keep the same request body and key after ambiguous transport failures.

Manual terminal and QR payments are cashier attestations; no provider settlement is recorded. QR transaction references are stored with the payment record. The refund flow records a full cash refund with optional inspected restocking. In reporting, refunds reduce tax and revenue on the refund date and reverse tracked cost for confirmed restockable items. Revenue is tax-exclusive. COGS uses immutable historical item costs. Estimated net profit subtracts recorded expenses; missing item costs make the gross profit estimate incomplete.

## Implementation status

The baseline covers signup, business selection, member roles, product and category management, stock movement recording, cash and manually confirmed card/split checkout, sale history, PDF receipts, full cash refund recording, expenses, reporting and CSV exports, business settings, customer selection, and supplier associations. Book metadata search and weighted quantities are implemented. All three migrations were applied directly to PostgreSQL 18 during development. The React code passed a strict type check and a Vite production build using cached frontend packages.

Restaurant tables, preparation tickets, table transfers, and cashier shifts have operational screens and tenant-scoped routes. Open tickets are unpaid and do not reserve stock. Paying a ticket closes it in the same transaction as the sale. Analytics includes breakdowns by category, tender, cashier, product quantity, and hour. Bill splitting into separate receipts, variants, modifiers, loyalty, graphical receipt branding, file uploads, product CSV import, payment-provider integration, refund requests, and several requested routes remain open. Some presets reserve feature keys for those extensions. The current browser checkout holds one basket in memory. Browser-to-printer behavior depends on the device and driver. Package installation, Prisma migration deployment, automated browser verification, and full API verification require an environment with registry access.


