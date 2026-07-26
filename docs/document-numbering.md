# Business document numbering

Human-readable numbers are allocated by `allocateDocumentNumber` inside the transaction that inserts the document. The `DocumentSequence` row is scoped by company, document type, and financial year; PostgreSQL's atomic upsert serializes concurrent allocations. A rolled-back document creation also rolls back its allocation.

| Document | Prefix | Stored business number |
| --- | --- | --- |
| Sales invoice (including offline sync) | `INV` | `SaleInvoice.invoiceNumber` |
| Purchase order | `PO` | `PurchaseOrder.poNumber` |
| Sales return | `SR` | `SaleReturn.returnNumber` |
| Purchase return | `PR` | `PurchaseReturn.returnNumber` |
| Quotation | `QT` | `Quotation.quoteNumber` |
| Cash receipt/payment voucher | `CR` / `CP` | `JournalEntry.voucherNumber` |
| Bank receipt/payment voucher | `BR` / `BP` | `JournalEntry.voucherNumber` |
| Manual journal voucher | `JV` | `JournalEntry.voucherNumber` |
| Automatic journal (invoice, purchase, return, customer receipt, supplier payment, expense, or stock adjustment posting) | `JE` | `JournalEntry.voucherNumber` |

Numbers such as customer/supplier references, cheque numbers, and product batch numbers are user-supplied identifiers and are not generated. Stock movements do not have a separate business number; their generated accounting document is the `JE` journal voucher. Every stored generated business-number column has a company-scoped unique database index, while the year in the formatted number and sequence key supplies financial-year isolation.
