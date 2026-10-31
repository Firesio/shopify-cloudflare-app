import { describe, expect, it } from "vitest";
import { BOOTSTRAP_GLOBAL, bootstrapScript, parseBootstrap } from "./bootstrap";
import { bootstrapFor, bootstrapScriptFor } from "./bootstrap.server";

describe("what the server tells the browser", () => {
  it("carries the page's language and ONLY the namespaces the routes declared", () => {
    const boot = bootstrapFor("es", ["common", "public"]);
    expect(boot.language).toBe("es");
    expect(Object.keys(boot.resources)).toEqual(["common", "public"]);
    expect(JSON.stringify(boot)).not.toContain("Iniciar sesión"); // the admin's string is not in a public page
    expect(JSON.stringify(boot)).not.toContain("senderDisclosure"); // and mail never leaves the server
  });

  it("is a script that sets one global, and the data can never close the tag", () => {
    const script = bootstrapScriptFor("en", ["common"]);
    expect(script.startsWith(`window.${BOOTSTRAP_GLOBAL}=`)).toBe(true);
    const hostile = bootstrapScript({ language: "en", resources: { common: { x: "</script><script>alert(1)</script>" } } });
    expect(hostile).not.toContain("</script>");
    expect(hostile).not.toContain("<");
    const value: unknown = new Function(`const window = {}; ${hostile} return window.${BOOTSTRAP_GLOBAL};`)();
    expect(parseBootstrap(value)?.resources.common).toEqual({ x: "</script><script>alert(1)</script>" });
  });

  it("is read back, and refused when it is not what the server writes", () => {
    expect(parseBootstrap(bootstrapFor("es", ["common"]))?.language).toBe("es");
    for (const bad of [undefined, null, "x", 5, [], { language: "de", resources: {} }, { language: "es" }, { language: "es", resources: { common: "text" } }, { language: "es", resources: [] }]) {
      expect(parseBootstrap(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
