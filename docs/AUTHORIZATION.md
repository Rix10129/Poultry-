# Authorization policy

Authorization is enforced in server actions and route handlers; hiding a control is never considered security. Denials use the common `{ "error": "Forbidden" }` response (HTTP 403 in route handlers).

| Role | Granted capabilities |
| --- | --- |
| OWNER | Every capability, including company settings, users, approvals, exports/restores, opening-balance corrections, journal posting, and period controls. |
| ADMIN | Operational administration and every sensitive capability except owner-only company settings. |
| ACCOUNTANT | Masters, sales/purchases, payments and corrections, accounting and journal posting, opening-balance corrections, exports, and period controls. |
| SALESMAN | Customer/master entry, sales creation/editing, and receipt entry. No cancellation, accounting, export, or balance correction. |
| STOREKEEPER | Product/master entry, purchasing creation/editing, and stock adjustments. No sales cancellation, accounting, export, or balance correction. |
| CASHIER | Sales creation and receipt entry only. |

The canonical, reviewable matrix is `ROLE_PERMISSIONS` in `src/lib/authorization.ts`. New mutations must name a permission and call `authorize` before reading input or accessing the database. Backup restore, opening-balance correction, journal posting, and period controls must respectively require `BACKUP_RESTORE`, `OPENING_BALANCE_CORRECT`, `JOURNAL_POST`, and `PERIOD_CONTROL`.
