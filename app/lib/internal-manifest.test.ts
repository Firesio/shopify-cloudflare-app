import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { identity } from "~/identity";
import { loader } from "~/routes/internal/manifest.webmanifest";
import { buildInternalManifest } from "./internal-manifest";

describe("buildInternalManifest", () => {
  it("names the app after the brand and scopes it to the console", () => {
    const manifest = buildInternalManifest("Acme");
    expect(manifest.name).toBe("Acme Console");
    expect(manifest.short_name).toBe("Acme Console");
    expect(manifest.start_url).toBe("/internal/dashboard");
    expect(manifest.scope).toBe("/internal/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
  });

  it("offers a 192 and a 512 icon plus a maskable one, all PNGs inside /internal-icons/", () => {
    const { icons } = buildInternalManifest("Acme");
    expect(icons.map((icon) => `${icon.sizes}:${icon.purpose}`)).toEqual(["192x192:any", "512x512:any", "512x512:maskable"]);
    for (const icon of icons) {
      expect(icon.src.startsWith("/internal-icons/")).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });

  it("points at icon files that exist, with the sizes it claims", () => {
    for (const icon of buildInternalManifest("Acme").icons) {
      const file = path.resolve(import.meta.dirname, "../../public", icon.src.slice(1));
      expect(existsSync(file), icon.src).toBe(true);
      const png = readFileSync(file);
      // PNG IHDR: width and height are the big-endian uint32s at byte 16 and 20.
      const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });

  it("uses literal hex colours, because a manifest cannot take CSS variables", () => {
    const manifest = buildInternalManifest("Acme");
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("the manifest route", () => {
  it("answers application/manifest+json with the identity's name, and needs no session", async () => {
    const response = loader();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/manifest+json");
    const body: unknown = await response.json();
    expect(body).toEqual(buildInternalManifest(identity.brandName));
  });
});
