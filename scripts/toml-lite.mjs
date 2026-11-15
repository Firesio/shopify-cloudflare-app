// Just enough TOML for shopify.app*.toml: the CLI writes a regular layout (`key = "value"`, `[section]`, `[[webhooks.subscriptions]]`),
// and a check that parsed it fully would be a dependency for what four regular expressions read.

export function tomlString(text, key) {
  return text.match(new RegExp(`^[ \\t]*${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1] ?? "";
}

export function tomlStrings(text, key) {
  const value = text.match(new RegExp(`^[ \\t]*${key}\\s*=\\s*\\[([^\\]]*)\\]`, "m"))?.[1] ?? "";
  return [...value.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

export function tomlSectionBody(text, section) {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^\\[${escaped}\\]\\s*$`, "m").exec(text);
  if (!header || header.index === undefined) return "";
  const rest = text.slice(header.index + header[0].length);
  const nextSection = rest.search(/^\[/m);
  return nextSection < 0 ? rest : rest.slice(0, nextSection);
}

export function tomlSectionString(text, section, key) {
  return tomlString(tomlSectionBody(text, section), key);
}

/** The value of `key = true|false` in a section, or null when it is absent. */
export function tomlSectionBool(text, section, key) {
  const value = new RegExp(`^[ \\t]*${key}\\s*=\\s*(true|false)\\b`, "m").exec(tomlSectionBody(text, section))?.[1];
  return value === undefined ? null : value === "true";
}


/**
 * Every `[[webhooks.subscriptions]]` entry as `{ topics, complianceTopics, uri }`. A subscription block runs until the next
 * `[[...]]` or `[section]` header.
 */
export function tomlWebhookSubscriptions(text) {
  const blocks = text.split(/^\s*\[\[webhooks\.subscriptions\]\]\s*$/m).slice(1);
  return blocks.map((block) => {
    const body = block.split(/^\s*\[/m)[0];
    return { topics: tomlStrings(body, "topics"), complianceTopics: tomlStrings(body, "compliance_topics"), uri: tomlString(body, "uri") };
  });
}
