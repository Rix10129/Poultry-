import assert from "node:assert/strict"
import test from "node:test"
import { calculatePurchaseBalance, calculateSupplierBalance } from "./supplier-ledger"

test("supplier balance applies every component once and ignores voided payments", () => {
    const result = calculateSupplierBalance({
      openingBalance: "100", purchases: [{ netAmount: "500", paidAmount: "50" }],
      payments: [{ amount: "75" }, { amount: "20", isVoided: true }],
      returns: [{ totalAmount: "25" }],
    })
  assert.deepEqual(
    { purchaseTimePaid: result.purchaseTimePaid, laterPaid: result.laterPaid, returned: result.returned, closingBalance: result.closingBalance },
    { purchaseTimePaid: 50, laterPaid: 75, returned: 25, closingBalance: 450 }
  )
})

test("purchase balance includes allocated later payments", () => {
  assert.equal(calculatePurchaseBalance({ netAmount: 300, paidAmount: 40 }, [{ amount: 60 }]), 200)
})
