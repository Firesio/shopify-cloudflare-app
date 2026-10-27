// A pseudo-locale for tests ("en-XA"): every letter accented, every string about 30% longer, wrapped in brackets, with
// {{placeholders}} left alone. Rendering a unit in it shows hard-coded copy (still plain English), truncation (the
// closing bracket is lost) and layouts that cannot grow.
import type { TextLayer } from "~/lib/language/text";

const ACCENTS: Readonly<Record<string, string>> = {
  a: "á", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "í", j: "ĵ", k: "ķ", l: "ĺ", m: "ɱ",
  n: "ñ", o: "ó", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "ú", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Í", J: "Ĵ", K: "Ķ", L: "Ĺ", M: "Ṁ",
  N: "Ñ", O: "Ó", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Ú", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

export function pseudoLocalize(text: string): string {
  const pieces = text.split(/(\{\{[^}]*\}\})/);
  const body = pieces
    .map((piece) => (piece.startsWith("{{") ? piece : [...piece].map((char) => ACCENTS[char] ?? char).join("")))
    .join("");
  const padding = "~".repeat(Math.ceil([...text].length * 0.3));
  return `[${body}${padding}]`;
}

/** A layer over another that answers every string in pseudo-locale. */
export function pseudoLayer(source: TextLayer): TextLayer {
  return {
    name: `pseudo:${source.name}`,
    keys: (namespace) => source.keys(namespace),
    get: (namespace, key) => {
      const text = source.get(namespace, key);
      return text === undefined ? undefined : pseudoLocalize(text);
    },
  };
}
