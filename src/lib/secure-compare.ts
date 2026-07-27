import { timingSafeEqual } from "crypto"

/** Constant-time string comparison — use for secrets (CRON_SECRET, tokens) to avoid timing side-channels. */
export function secureEquals(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
