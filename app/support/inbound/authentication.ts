export interface RawHeader {
  /** Lowercase header name. */
  readonly key: string;
  readonly value: string;
}

const DKIM_PASS = /dkim=pass\b[^;]*?header\.(?:i|d)=@?([a-z0-9][a-z0-9.-]*)/gi;

/**
 * Domains whose DKIM signature a TRUSTED receiver saw pass.
 *
 * `Authentication-Results` is just a header, and a sender can write one. Only
 * those whose authserv-id (the first token) is the one this deployment trusts
 * count, so a forged header naming another server proves nothing. With no
 * trusted id configured the answer is always empty: no sender is verified, and
 * a source that needs one (the Shopify relay) never matches.
 */
export function dkimPassDomains(headers: readonly RawHeader[], trustedServerId: string): readonly string[] {
  const trusted = trustedServerId.trim().toLowerCase();
  if (trusted === "") return [];
  const domains = headers
    .filter((header) => header.key === "authentication-results")
    .filter((header) => header.value.split(";")[0]?.trim().toLowerCase() === trusted)
    .flatMap((header) => [...header.value.matchAll(DKIM_PASS)].map((match) => (match[1] ?? "").toLowerCase()));
  return [...new Set(domains.filter((domain) => domain !== ""))];
}
