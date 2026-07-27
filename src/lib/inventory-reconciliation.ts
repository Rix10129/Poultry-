type Numeric = number | string | { toString(): string };

const number = (value: Numeric) => Number(value.toString());

export interface BatchSnapshot {
  id: string;
  productId: string;
  quantity: number;
  purchasePrice: Numeric;
}

export interface MovementSnapshot {
  productId: string;
  batchId?: string | null;
  quantity: number;
}

/** Throws when the inventory caches cannot be reproduced from immutable movements. */
export function assertStockReconciles(
  batches: BatchSnapshot[],
  movements: MovementSnapshot[],
  productTotals: Map<string, number>,
) {
  for (const batch of batches) {
    const moved = movements
      .filter((movement) => movement.batchId === batch.id)
      .reduce((total, movement) => total + movement.quantity, 0);
    if (moved !== batch.quantity) {
      throw new Error(
        `Batch ${batch.id}: movements ${moved} != quantity ${batch.quantity}`,
      );
    }
  }

  for (const [productId, expected] of productTotals) {
    const batchTotal = batches
      .filter((batch) => batch.productId === productId)
      .reduce((total, batch) => total + batch.quantity, 0);
    const movementTotal = movements
      .filter((movement) => movement.productId === productId)
      .reduce((total, movement) => total + movement.quantity, 0);
    if (batchTotal !== expected || movementTotal !== expected) {
      throw new Error(
        `Product ${productId}: batches ${batchTotal}, movements ${movementTotal}, total ${expected}`,
      );
    }
  }
}

export function stockValuation(batches: BatchSnapshot[]) {
  return batches.reduce(
    (total, batch) => total + batch.quantity * number(batch.purchasePrice),
    0,
  );
}

type ReservableBatchClient = {
  productBatch: {
    updateMany(args: {
      where: {
        id: string;
        companyId: string;
        productId: string;
        quantity: { gte: number };
      };
      data: { quantity: { decrement: number } };
    }): Promise<{ count: number }>;
  };
};

/** Atomically reserves stock; the conditional update prevents concurrent overselling. */
export async function reserveBatchStock(
  tx: ReservableBatchClient,
  input: {
    batchId: string;
    companyId: string;
    productId: string;
    quantity: number;
  },
) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0)
    throw new Error("Quantity must be a positive integer");
  const result = await tx.productBatch.updateMany({
    where: {
      id: input.batchId,
      companyId: input.companyId,
      productId: input.productId,
      quantity: { gte: input.quantity },
    },
    data: { quantity: { decrement: input.quantity } },
  });
  if (result.count !== 1)
    throw new Error("Insufficient stock or batch not found");
}
