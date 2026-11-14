/**
 * Cloudflare's Rate Limiting binding as a yes/no (docs/architecture.md section 6.4). It FAILS CLOSED: a binding that is
 * missing or throws answers "no", because this is the anti-abuse path, and the one place a merchant must be able to reach (support)
 * keeps working through the plan's own allowances, not through an open limiter. `key` is never an email or phone: hash first.
 */
export function withinLimit(limiter: RateLimit | undefined) {
  return async (key: string): Promise<boolean> => {
    if (limiter === undefined) return false;
    try {
      return (await limiter.limit({ key })).success;
    } catch {
      return false;
    }
  };
}
