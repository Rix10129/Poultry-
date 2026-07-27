import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomerLedger,
  calculateCustomerBalance,
} from "../customer-ledger";
import {
  buildSupplierStatement,
  calculateSupplierBalance,
} from "../supplier-ledger";
import {
  assertStockReconciles,
  stockValuation,
} from "../inventory-reconciliation";
import { assertBalanced } from "./posting-service";

const day = (value: number) =>
  new Date(`2026-01-${String(value).padStart(2, "0")}T12:00:00Z`);
const customer = {
  openingBalance: 100,
  invoices: [] as Array<{
    id: string;
    invoiceNumber: string;
    invoiceDate: Date;
    netAmount: number;
  }>,
  payments: [] as Array<{
    paymentDate: Date;
    amount: number;
    paymentMode: string;
  }>,
  returns: [] as Array<{
    returnNumber: string;
    returnDate: Date;
    totalAmount: number;
  }>,
};
const supplier = {
  openingBalance: 80,
  purchases: [] as Array<{ netAmount: number; paidAmount: number }>,
  payments: [] as Array<{ amount: number }>,
  returns: [] as Array<{ totalAmount: number }>,
};

function assertStatements(dayNumber: number) {
  const customerSummary = calculateCustomerBalance(customer);
  const customerStatement = buildCustomerLedger({
    customerOpeningBalance: customer.openingBalance,
    fromDate: day(1),
    toDate: day(dayNumber),
    ...customer,
  });
  assert.equal(
    customerStatement.closingBalance,
    customerSummary.closingBalance,
    "customer statement must match balance summary",
  );
  const supplierSummary = calculateSupplierBalance(supplier);
  assert.equal(
    buildSupplierStatement(supplier).closingBalance,
    supplierSummary.closingBalance,
    "supplier statement must match balance summary",
  );
}

function journal(
  name: string,
  debits: Array<{ account: string; amount: number }>,
  credits: Array<{ account: string; amount: number }>,
) {
  assert.doesNotThrow(
    () => assertBalanced(debits as never, credits as never),
    `${name} journal must balance`,
  );
}

test("opening balances, trading, payments, returns, expenses and vouchers preserve accounting invariants", () => {
  journal(
    "opening balances",
    [
      { account: "ACCOUNTS_RECEIVABLE", amount: 100 },
      { account: "OPENING_EQUITY", amount: 80 },
    ],
    [
      { account: "OPENING_EQUITY", amount: 100 },
      { account: "ACCOUNTS_PAYABLE", amount: 80 },
    ],
  );
  assertStatements(1);

  // A 10% line discount on 200 plus 18 tax produces a 198 receivable.
  customer.invoices.push({
    id: "sale",
    invoiceNumber: "INV-1",
    invoiceDate: day(2),
    netAmount: 198,
  });
  journal(
    "sale with discount and output tax",
    [{ account: "ACCOUNTS_RECEIVABLE", amount: 198 }],
    [
      { account: "SALES", amount: 180 },
      { account: "OUTPUT_TAX", amount: 18 },
    ],
  );
  assertStatements(2);

  supplier.purchases.push({ netAmount: 330, paidAmount: 30 });
  journal(
    "purchase with input tax",
    [
      { account: "INVENTORY", amount: 300 },
      { account: "INPUT_TAX", amount: 30 },
    ],
    [
      { account: "CASH", amount: 30 },
      { account: "ACCOUNTS_PAYABLE", amount: 300 },
    ],
  );
  assertStatements(3);

  customer.payments.push({
    paymentDate: day(4),
    amount: 50,
    paymentMode: "CASH",
  });
  journal(
    "customer payment",
    [{ account: "CASH", amount: 50 }],
    [{ account: "ACCOUNTS_RECEIVABLE", amount: 50 }],
  );
  assertStatements(4);

  supplier.payments.push({ amount: 40 });
  journal(
    "supplier payment",
    [{ account: "ACCOUNTS_PAYABLE", amount: 40 }],
    [{ account: "BANK", amount: 40 }],
  );
  assertStatements(5);

  customer.returns.push({
    returnNumber: "SR-1",
    returnDate: day(6),
    totalAmount: 22,
  });
  journal(
    "sale return",
    [{ account: "SALES", amount: 22 }],
    [{ account: "ACCOUNTS_RECEIVABLE", amount: 22 }],
  );
  assertStatements(6);

  supplier.returns.push({ totalAmount: 33 });
  journal(
    "purchase return",
    [{ account: "ACCOUNTS_PAYABLE", amount: 33 }],
    [{ account: "INVENTORY", amount: 33 }],
  );
  assertStatements(7);

  journal(
    "expense",
    [{ account: "EXPENSE", amount: 25 }],
    [{ account: "CASH", amount: 25 }],
  );
  assertStatements(8);
  journal(
    "manual voucher",
    [{ account: "BANK", amount: 75 }],
    [{ account: "CASH", amount: 75 }],
  );
  assertStatements(9);
});

test("stock movements reconcile by batch and product and valuation uses remaining batch cost", () => {
  const batches = [
    { id: "b1", productId: "p1", quantity: 7, purchasePrice: 10 },
    { id: "b2", productId: "p1", quantity: 4, purchasePrice: 12.5 },
  ];
  const movements = [
    { batchId: "b1", productId: "p1", quantity: 10 },
    { batchId: "b1", productId: "p1", quantity: -4 },
    { batchId: "b1", productId: "p1", quantity: 1 },
    { batchId: "b2", productId: "p1", quantity: 5 },
    { batchId: "b2", productId: "p1", quantity: -1 },
  ];
  assert.doesNotThrow(() =>
    assertStockReconciles(batches, movements, new Map([["p1", 11]])),
  );
  assert.equal(stockValuation(batches), 120);
});
