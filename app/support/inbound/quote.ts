// A reply's own words end where the client starts quoting the mail it answers.
const QUOTE_MARKERS: readonly RegExp[] = [
  /^On .{5,200}wrote:\s*$/i,
  /^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}\s*$/i,
  /^_{5,}\s*$/,
  /^From:\s.+$/i,
];

function isQuoteStart(lines: readonly string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (QUOTE_MARKERS.some((marker) => marker.test(line.trim()))) {
    // "On <date>, <name>" often wraps onto a second line before "wrote:".
    return true;
  }
  const wrapped = `${line.trim()} ${(lines[index + 1] ?? "").trim()}`;
  return /^On .{5,200}wrote:\s*$/i.test(wrapped);
}

/**
 * What the sender wrote, without the quoted history under it. Display-only: the
 * raw mail is kept, so nothing is lost if a client's quote style is not caught.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((_, index) => isQuoteStart(lines, index));
  const kept = cut === -1 ? lines : lines.slice(0, cut);
  while (kept.length > 0 && kept[kept.length - 1]?.trim().startsWith(">")) kept.pop();
  return kept.join("\n").trim();
}
