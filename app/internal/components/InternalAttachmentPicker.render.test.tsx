import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UploadRow } from "~/support/upload-rows";
import { InternalAttachmentPicker } from "./InternalAttachmentPicker";

const none = { rows: [], uploadIds: [], busy: false, skipped: 0, add: async () => {}, remove: () => {}, reset: () => {} };

describe("InternalAttachmentPicker", () => {
  it("renders a native file input and an attach button for the internal console", () => {
    const html = renderToStaticMarkup(<InternalAttachmentPicker uploads={none} />);

    expect(html).toContain('type="file"');
    expect(html).toContain(">Attach files<");
    expect(html).toContain("<button");
    expect(html).not.toContain("<s-button");
  });

  it("offers only what the server allows, and says the limits from the same constants", () => {
    const html = renderToStaticMarkup(<InternalAttachmentPicker uploads={none} />);
    expect(html).not.toContain("image/*");
    expect(html).toContain("image/png");
    expect(html).toContain("Up to 10 files: 10 MB images, 100 MB video, and 25 MB files");
  });

  it("names the file and the reason for each failure", () => {
    const failed: UploadRow = { key: "a", filename: "huge.mp4", sizeBytes: 1, kind: null, previewUrl: null, state: { status: "failed", reason: "too_large" } };
    const html = renderToStaticMarkup(<InternalAttachmentPicker uploads={{ ...none, rows: [failed] }} />);
    expect(html).toContain("huge.mp4 is too big.");
  });
});
