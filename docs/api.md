# REST API

All routes use the same origin as the browser. JSON mutations require the configured Origin. Protected tenant routes require both the session cookie and the `X-Business-Id` header. Currency values are decimal strings in API responses. Checkout quantity and tender fields accept decimal strings.

| Method and path | Access | Purpose |
| --- | --- | --- |
| GET /api/health | Public | Database readiness |
| POST /api/setup | Signup enabled | Create an admin, business, settings, and preset modules |
| POST /api/login | Public | Authenticate with email and password |
| POST /api/logout | Session cookie | End the current session |
| GET /api/me | Signed in | Identity and active memberships |
| GET /api/config | Member | Business and effective settings |
| PUT /api/config | Admin | Update business, settings, and enabled modules |
| GET /api/products | Member | Active catalog, or archived catalog with admin access and all=true |
| PUT /api/products/:id | Admin | Create with new or update an existing product |
| GET, POST /api/categories | Member / admin | List or create categories |
| PATCH /api/categories/:id | Admin | Rename a category |
| GET, POST /api/inventory | Admin | List or record inventory movements |
| GET, POST /api/employees | Admin | List or create memberships |
| PATCH /api/employees/:id | Admin | Enable or disable a membership |
| POST /api/quote | Member | Validate and price a basket |
| POST /api/checkout | Member | Commit the basket and tender records |
| GET /api/sales | Member | Recent tenant sales or the cashier's own sales |
| GET /api/sales/:id/receipt.pdf | Member | Download an authorized thermal-width receipt |
| POST /api/sales/:id/refund | Admin | Record a full cash refund |
| GET, POST /api/expenses | Admin | List or record operating expenses |
| GET /api/report | Admin | Metrics for an inclusive start and exclusive end in ISO 8601. Append format=pdf for a summary PDF |
| GET /api/customers | Member | List customers when enabled; staff see names and IDs |
| PUT /api/customers/:id | Admin | Create with new, edit or archive a customer |
| GET /api/suppliers | Admin | List suppliers when enabled |
| PUT /api/suppliers/:id | Admin | Create with new, edit or archive a supplier |
| GET, POST /api/tables | Member / admin | List table occupancy or add a table when enabled |
| GET, POST /api/tickets | Member | List or send preparation tickets when enabled |
| PATCH /api/tickets/:id | Member | Advance a ticket, transfer its table, or cancel an eligible order |
| GET, POST /api/shifts | Member | View shifts or open a cash drawer shift |
| PATCH /api/shifts/:id | Member | Close an authorized shift |
| GET /api/audit | Admin | Recent audit events |

Checkout requires a UUID `requestKey`, `lines` with `productId` and `quantity`, an optional percentage `discount`, and `payments`. Each payment includes `method` and `amount`. Cash requires `tendered`; MANUAL_CARD requires an approved terminal `reference` and an enabled business setting. A zero-total sale uses an empty payments array. Refund requires `reason` and `restocked`.

Common errors use `{ "error": "message" }`, with 401 for a missing session, 403 for denied access, 404 for missing tenant-scoped resources, 409 for conflicts, and 422 for validation errors.


