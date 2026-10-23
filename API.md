# MediVault API

Base path: `/api`. JSON endpoints return `{ message }` on errors. Protected requests use `Authorization: Bearer <token>`; tokens expire after eight hours and are held in frontend memory.

## Authentication

| Method | Path | Access |
| --- | --- | --- |
| POST | `/auth/login` | Public; rate-limited |
| POST | `/auth/register` | Public; creates pending cashier or supplier account |
| POST | `/auth/change-password` | Authenticated |
| GET | `/auth/me` | Authenticated |
| POST | `/auth/logout` | Public; client discards its in-memory token |

Registration accepts `role: "cashier"` or `role: "supplier"`; supplier registrations also require `companyName`. Admins are created only by the private seed script.

## Inventory and sales

| Method | Path | Access |
| --- | --- | --- |
| GET | `/medicines` | Admin, cashier |
| POST | `/medicines` | Admin |
| GET | `/medicines/alerts/low-stock` | Admin, cashier |
| GET | `/medicines/alerts/near-expiry?days=90` | Admin, cashier |
| GET | `/medicines/:id` | Admin, cashier |
| PUT | `/medicines/:id` | Admin |
| DELETE | `/medicines/:id` | Admin; deactivates without deleting history |
| POST | `/sales` | Admin, cashier |
| GET | `/sales` | Admin or sales created by the current cashier |
| GET | `/sales/:id` | Admin or the sale's cashier |

Sale items accept medicine IDs and positive integer quantities; server-side prices, tax, FEFO allocations, and totals are derived from stored medicine records.

## Purchases, suppliers, and receiving

| Method | Path | Access |
| --- | --- | --- |
| GET, POST | `/purchases` | Admin |
| GET | `/purchases/:id` | Admin |
| GET, GET by ID, POST, PUT, DELETE | `/suppliers` | Admin; deletion behavior follows the supplier route |
| GET | `/restock-requests` | Admin, cashier |
| POST | `/restock-requests` | Admin, cashier |
| GET | `/restock-requests/supplier` | Supplier, assigned records only |
| GET | `/supplier/dashboard`, `/supplier/orders` | Supplier, assigned records only |
| GET | `/supplier/orders/:id` | Supplier, order owner only |
| PATCH | `/supplier/orders/:id/accept` | Supplier, order owner only |
| PATCH | `/supplier/orders/:id/dispatch` | Supplier, order owner only |
| PATCH | `/supplier/orders/:id/deliver` | Supplier, order owner only; does not add stock |
| GET | `/admin/purchase-orders/orders` | Admin |
| POST | `/admin/purchase-orders/orders/:id/receive` | Admin; verifies batch and expiry, updates stock and purchase history transactionally |

## Administration and reports

| Method | Path | Access |
| --- | --- | --- |
| GET | `/staff` | Admin |
| PATCH | `/staff/:id/approval` | Admin |
| PATCH | `/staff/:id/status` | Admin |
| GET | `/supplier-accounts/applications` | Admin |
| PATCH | `/supplier-accounts/applications/:id` | Admin |
| GET | `/supplier-accounts/me`, `/supplier-accounts/my-orders` | Supplier, own account only |
| GET | `/admin/audit-logs` | Admin |
| GET | `/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | Admin |
| GET | `/admin/purchase-orders/notifications` | Admin |
| GET | `/health` | Public health check |

Sales and verified receiving use MongoDB transactions. Configure a replica set; otherwise those operations fail without committing stock changes. See [README.md](README.md) for setup and backup guidance.
