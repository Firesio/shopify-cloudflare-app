import { describe, it, expect } from "vitest";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  FILE_MAX_BYTES,
  IMAGE_MAX_BYTES,
  MAX_FILES,
  VIDEO_MAX_BYTES,
  attachmentKey,
  decodeFilenameHeader,
  fileExtensionLabel,
  safeFilename,
  validateUpload,
} from "./attachment";

describe("validateUpload", () => {
  it("accepts the common image types merchants actually paste", () => {
    for (const type of ["image/png", "image/jpeg", "image/gif", "image/webp"]) {
      const result = validateUpload({ contentType: type, sizeBytes: 1024 });
      expect(result.ok, type).toBe(true);
      if (result.ok) expect(result.value.kind).toBe("image");
    }
  });

  it("accepts video, which is the whole point of screen recordings", () => {
    for (const type of ["video/mp4", "video/webm", "video/quicktime"]) {
      const result = validateUpload({ contentType: type, sizeBytes: 5_000_000 });
      expect(result.ok, type).toBe(true);
      if (result.ok) expect(result.value.kind).toBe("video");
    }
  });

  it("accepts CSV and ordinary support documents as downloadable files", () => {
    for (const type of [
      "text/csv",
      "application/pdf",
      "text/plain",
      "application/json",
      "application/zip",
    ]) {
      const result = validateUpload({ contentType: type, sizeBytes: 5_000_000 });
      expect(result.ok, type).toBe(true);
      if (result.ok) expect(result.value.kind).toBe("file");
    }
  });

  it("ignores charset and casing on the content type", () => {
    // Browsers send `video/MP4` and occasionally a parameter.
    const result = validateUpload({
      contentType: "VIDEO/MP4; codecs=avc1",
      sizeBytes: 10,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses executable and active document types", () => {
    for (const type of ["application/x-msdownload", "text/html", "application/javascript", ""]) {
      const result = validateUpload({ contentType: type, sizeBytes: 10 });
      expect(result.ok, type).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unsupported_type");
    }
  });

  it("refuses an executable dressed as a long image name", () => {
    // The content type is what is enforced; the filename is never trusted.
    const result = validateUpload({
      contentType: "application/x-msdownload",
      sizeBytes: 10,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an empty file", () => {
    const result = validateUpload({ contentType: "image/png", sizeBytes: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty");
  });

  it("caps images at the image limit", () => {
    expect(validateUpload({ contentType: "image/png", sizeBytes: IMAGE_MAX_BYTES }).ok).toBe(true);
    const over = validateUpload({
      contentType: "image/png",
      sizeBytes: IMAGE_MAX_BYTES + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toBe("too_large");
  });

  it("caps videos at the larger video limit, not the image one", () => {
    // A screen recording is legitimately bigger than a screenshot; sharing one
    // cap would either block video or let a 100 MB PNG through.
    expect(validateUpload({ contentType: "video/mp4", sizeBytes: IMAGE_MAX_BYTES + 1 }).ok).toBe(true);
    expect(validateUpload({ contentType: "video/mp4", sizeBytes: VIDEO_MAX_BYTES }).ok).toBe(true);
    expect(validateUpload({ contentType: "video/mp4", sizeBytes: VIDEO_MAX_BYTES + 1 }).ok).toBe(false);
  });

  it("gives video a bigger allowance than images", () => {
    expect(VIDEO_MAX_BYTES).toBeGreaterThan(IMAGE_MAX_BYTES);
  });

  it("caps regular files at their own limit", () => {
    expect(validateUpload({ contentType: "text/csv", sizeBytes: FILE_MAX_BYTES }).ok).toBe(true);
    expect(validateUpload({ contentType: "text/csv", sizeBytes: FILE_MAX_BYTES + 1 }).ok).toBe(false);
  });
});

describe("safeFilename", () => {
  it("keeps an ordinary name intact", () => {
    expect(safeFilename("screenshot 2026-08-25.png")).toBe("screenshot 2026-08-25.png");
  });

  it("strips any path, so an upload cannot name a directory", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("C:\\Users\\me\\shot.png")).toBe("shot.png");
  });

  it("strips control characters and quotes that would break a header", () => {
    // This value ends up in a Content-Disposition header on download.
    expect(safeFilename('a"b\r\nc.png')).toBe("abc.png");
  });

  it("truncates a very long name but keeps its extension", () => {
    const name = `${"a".repeat(300)}.png`;
    const safe = safeFilename(name);
    expect(safe.length).toBeLessThanOrEqual(100);
    expect(safe.endsWith(".png")).toBe(true);
  });

  it("falls back to a placeholder when nothing usable is left", () => {
    expect(safeFilename("///")).toBe("file");
    expect(safeFilename("")).toBe("file");
    expect(safeFilename("..")).toBe("file");
    expect(safeFilename("   ")).toBe("file");
  });

  it("keeps letters and digits of any script, so a merchant recognises their own file", () => {
    expect(safeFilename("注文一覧 2026.csv")).toBe("注文一覧 2026.csv");
    expect(safeFilename("Скриншот_ошибки.png")).toBe("Скриншот_ошибки.png");
    expect(safeFilename("captura de pantalla ñandú.png")).toBe("captura de pantalla ñandú.png");
    expect(safeFilename("تقرير.pdf")).toBe("تقرير.pdf");
  });

  it("composes accents so the same name is stored once however the OS typed it", () => {
    expect(safeFilename("cafe\u0301.png")).toBe("caf\u00e9.png");
  });

  it("strips a path in any script, leaving only the name", () => {
    expect(safeFilename("../../注文/一覧.csv")).toBe("一覧.csv");
    expect(safeFilename("..\\..\\Скрипт.txt")).toBe("Скрипт.txt");
  });

  it("removes control characters, bidi overrides and look-alike separators", () => {
    expect(safeFilename("a\u0000b\u0007c.png")).toBe("abc.png");
    // U+202E would make "exe.png" display as "gnp.exe".
    expect(safeFilename("report\u202Egnp.exe")).toBe("reportgnp.exe");
    // A fullwidth solidus and a division slash are not path separators, but they are not letters either.
    expect(safeFilename("a\uFF0Fb\u2215c.png")).toBe("abc.png");
    expect(safeFilename("semi;colon<tag>|pipe*.txt")).toBe("semicolontagpipe.txt");
  });

  it("truncates by characters, never through the middle of a pair", () => {
    const name = `${"😀".repeat(150)}.png`;
    const safe = safeFilename(name);
    // Emoji are symbols, not letters: they are removed, which leaves only the extension's stem placeholder.
    expect(safe).toBe(".png");
    const cjk = `${"注".repeat(150)}.csv`;
    const truncated = safeFilename(cjk);
    expect(Array.from(truncated).length).toBeLessThanOrEqual(100);
    expect(truncated.endsWith(".csv")).toBe(true);
    expect(truncated).not.toContain("\uFFFD");
  });
});

describe("decodeFilenameHeader", () => {
  it("undoes the browser's percent-encoding, so a name with spaces or accents arrives intact", () => {
    expect(decodeFilenameHeader(encodeURIComponent("my shot ñ.png"))).toBe("my shot ñ.png");
    expect(decodeFilenameHeader(encodeURIComponent("注文.csv"))).toBe("注文.csv");
  });

  it("keeps a malformed escape as sent instead of throwing", () => {
    expect(decodeFilenameHeader("100%.png")).toBe("100%.png");
    expect(safeFilename(decodeFilenameHeader("100%.png"))).toBe("100.png");
  });

  it("decodes an encoded traversal and still strips it", () => {
    expect(safeFilename(decodeFilenameHeader(encodeURIComponent("../../etc/passwd")))).toBe("passwd");
    expect(safeFilename(decodeFilenameHeader("..%2F..%2Fetc%2Fpasswd"))).toBe("passwd");
  });
});

describe("fileExtensionLabel", () => {
  it("shows the extension in capitals, at most four letters", () => {
    expect(fileExtensionLabel("orders.csv")).toBe("CSV");
    expect(fileExtensionLabel("archive.tar.gz")).toBe("GZ");
    expect(fileExtensionLabel("sheet.xlsx")).toBe("XLSX");
    expect(fileExtensionLabel("notes.markdown")).toBe("MARK");
  });

  it("says FILE when there is no extension to show, rather than the start of the name", () => {
    expect(fileExtensionLabel("README")).toBe("FILE");
    expect(fileExtensionLabel(".gitignore")).toBe("FILE");
    expect(fileExtensionLabel("trailing.")).toBe("FILE");
  });
});

describe("what the picker offers", () => {
  it("is exactly the server's allowlist, so nothing the server refuses is offered", () => {
    for (const type of ATTACHMENT_ACCEPT) {
      expect(validateUpload({ contentType: type, sizeBytes: 1 }).ok, type).toBe(true);
    }
    expect(ATTACHMENT_ACCEPT_ATTRIBUTE.split(",")).toEqual([...ATTACHMENT_ACCEPT]);
  });

  it("does not advertise image/* or video/*, which would offer HEIC and SVG", () => {
    expect(ATTACHMENT_ACCEPT_ATTRIBUTE).not.toContain("image/*");
    expect(ATTACHMENT_ACCEPT).not.toContain("image/svg+xml");
    expect(ATTACHMENT_ACCEPT).not.toContain("image/heic");
  });

  it("caps a message at ten files", () => {
    expect(MAX_FILES).toBe(10);
  });
});

describe("attachmentKey", () => {
  it("scopes the object by shop and ticket, and never trusts the filename", () => {
    const key = attachmentKey({
      shop: "demo.myshopify.com",
      ticketId: "tkt_1",
      uploadId: "up_2",
    });
    // Shop-first so a prefix listing is a tenant boundary, per @rules/data.md.
    expect(key).toBe("support/demo.myshopify.com/tkt_1/up_2");
  });

  it("produces a distinct key per upload", () => {
    const base = { shop: "s.myshopify.com", ticketId: "t" };
    expect(attachmentKey({ ...base, uploadId: "a" })).not.toBe(
      attachmentKey({ ...base, uploadId: "b" }),
    );
  });
});
