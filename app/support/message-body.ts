/**
 * A message body as paragraphs. Polaris text does not keep line breaks, so each non-empty line becomes its own
 * paragraph; blank lines separate and are dropped. (Indentation inside a line is not kept: pasted log output
 * loses its alignment, not its words.)
 */
export function bodyLines(body: string): string[] {
  return body.split(/\r?\n/).filter((line) => line.trim() !== "");
}
