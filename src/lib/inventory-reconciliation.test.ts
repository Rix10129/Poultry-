import assert from "node:assert/strict";
import test from "node:test";
import {
  assertStockReconciles,
  reserveBatchStock,
} from "./inventory-reconciliation";

test("concurrent stock allocations cannot oversell a batch", async () => {
  let available = 5;
  const tx = {
    productBatch: {
      updateMany: async ({ where, data }: any) => {
        // JavaScript executes this check-and-decrement synchronously, mirroring one atomic UPDATE.
        if (available < where.quantity.gte) return { count: 0 };
        available -= data.quantity.decrement;
        return { count: 1 };
      },
    },
  };
  const results = await Promise.allSettled([
    reserveBatchStock(tx, {
      batchId: "b",
      companyId: "c",
      productId: "p",
      quantity: 4,
    }),
    reserveBatchStock(tx, {
      batchId: "b",
      companyId: "c",
      productId: "p",
      quantity: 4,
    }),
  ]);
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(available, 1);
});

test("reconciliation reports a stale batch or product cache", () => {
  assert.throws(
    () =>
      assertStockReconciles(
        [{ id: "b", productId: "p", quantity: 2, purchasePrice: 1 }],
        [{ batchId: "b", productId: "p", quantity: 3 }],
        new Map([["p", 2]]),
      ),
    /movements 3 != quantity 2/,
  );
});
