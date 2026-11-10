import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UploadController } from "~/routes/app/support/use-pending-uploads";
import type { UploadRow } from "~/support/upload-rows";
import { AttachmentPicker, type AttachmentPickerLabels } from "./AttachmentPicker";

const labels: AttachmentPickerLabels = {
  label: "Attachments",
  limits: "Up to 10 files",
  skipped: "Only 10 files fit",
  typeRejected: "That file type is not supported.",
  uploading: (filename) => `Uploading ${filename}`,
  remove: (filename) => `Remove ${filename}`,
  failed: (filename) => `${filename} could not be added`,
  reason: (reason) => `reason:${reason}`,
};

const row = (key: string, state: UploadRow["state"], over: Partial<UploadRow> = {}): UploadRow => ({
  key,
  filename: `${key}.png`,
  sizeBytes: 2048,
  kind: "image",
  previewUrl: `blob:${key}`,
  state,
  ...over,
});

const done = (key: string, uploadId = `up_${key}`): UploadRow => row(key, { status: "done", uploadId, r2Key: "k", contentType: "image/png" });

function controller(rows: UploadRow[], over: Partial<UploadController> = {}): UploadController {
  return {
    rows,
    uploadIds: rows.flatMap((entry) => (entry.state.status === "done" ? [entry.state.uploadId] : [])),
    busy: rows.some((entry) => entry.state.status === "uploading"),
    skipped: 0,
    add: vi.fn(async () => undefined),
    remove: vi.fn(),
    reset: vi.fn(),
    ...over,
  };
}

const renderPicker = (uploads: UploadController) =>
  render(<AttachmentPicker uploads={uploads} labels={labels} formatSize={(bytes) => `${bytes} B`} />);

/** The drop zone is a Polaris custom element: here it is an inert tag we drive with the events it emits. */
function dropZone(container: HTMLElement) {
  const zone = container.querySelector("s-drop-zone");
  if (!zone) throw new Error("drop zone missing");
  return zone;
}

describe("AttachmentPicker", () => {
  it("offers a drop zone that accepts exactly what the server allows and several files at once", () => {
    const { container } = renderPicker(controller([]));
    const zone = dropZone(container);
    const accept = zone.getAttribute("accept") ?? "";
    expect(accept.split(",")).toContain("image/png");
    expect(accept).not.toContain("image/*");
    expect(accept).not.toContain("svg");
    expect(zone.hasAttribute("multiple")).toBe(true);
    expect(container.textContent).toContain("Up to 10 files");
  });

  it("shows the drop zone but takes no files while the page it sits on is loading", () => {
    const { container } = render(<AttachmentPicker uploads={controller([])} labels={labels} formatSize={(bytes) => `${bytes} B`} disabled />);
    expect(dropZone(container).hasAttribute("disabled")).toBe(true);
    expect(dropZone(container).getAttribute("label")).toBe("Attachments");
  });

  it("hands the picked files to the controller and clears the zone's own selection", () => {
    const uploads = controller([]);
    const { container } = renderPicker(uploads);
    const zone = dropZone(container);
    const file = new File(["abc"], "new.png", { type: "image/png" });
    Object.defineProperty(zone, "files", { value: [file], configurable: true });
    Object.defineProperty(zone, "value", { value: "stale", writable: true, configurable: true });

    fireEvent(zone, new Event("change"));

    expect(uploads.add).toHaveBeenCalledWith([file]);
    expect(Reflect.get(zone, "value")).toBe("");
  });

  it("shows a finished file with its size and a remove button named after it", () => {
    const uploads = controller([done("shot")]);
    const { container } = renderPicker(uploads);

    expect(container.querySelector("s-thumbnail")?.getAttribute("alt")).toBe("shot.png");
    expect(container.textContent).toContain("2048 B");
    const remove = container.querySelector('s-button[accessibilityLabel="Remove shot.png"]');
    expect(remove).not.toBeNull();
    if (remove) fireEvent.click(remove);
    expect(uploads.remove).toHaveBeenCalledWith("shot");
  });

  it("shows a file still uploading with a labelled spinner and no remove button", () => {
    const { container } = renderPicker(controller([row("slow", { status: "uploading" })]));
    expect(container.querySelector("s-spinner")?.getAttribute("accessibilityLabel")).toBe("Uploading slow.png");
    expect(container.querySelector('s-button[accessibilityLabel="Remove slow.png"]')).toBeNull();
  });

  it("shows a non-image as its extension rather than a preview", () => {
    const { container } = renderPicker(controller([row("data", { status: "done", uploadId: "u", r2Key: "k", contentType: "text/csv" }, { filename: "orders.csv", kind: "file", previewUrl: "blob:x" })]));
    expect(container.querySelector("s-thumbnail")).toBeNull();
    expect(container.querySelector("s-badge")?.textContent).toBe("CSV");
  });

  it("reports each failure in its own critical banner naming the file and the specific reason", () => {
    const uploads = controller([
      row("a", { status: "failed", reason: "too_large" }),
      row("b", { status: "failed", reason: "unsupported_type" }, { kind: null, previewUrl: null }),
      done("c"),
    ]);
    const { container } = renderPicker(uploads);
    const banners = Array.from(container.querySelectorAll('s-banner[tone="critical"]'));

    expect(banners.map((banner) => banner.getAttribute("heading"))).toEqual(["a.png could not be added", "b.png could not be added"]);
    expect(banners.map((banner) => banner.textContent)).toEqual(["reason:too_large", "reason:unsupported_type"]);
    // A failed file is not also listed as a file.
    expect(container.querySelector('s-button[accessibilityLabel="Remove a.png"]')).toBeNull();
  });

  it("dismissing a failure removes that row", () => {
    const uploads = controller([row("a", { status: "failed", reason: "too_large" })]);
    const { container } = renderPicker(uploads);
    const banner = container.querySelector("s-banner");
    if (!banner) throw new Error("banner missing");
    fireEvent(banner, new Event("dismiss"));
    expect(uploads.remove).toHaveBeenCalledWith("a");
  });

  it("says when files did not fit under the maximum", () => {
    const { container } = renderPicker(controller([done("a")], { skipped: 3 }));
    expect(container.querySelector('s-banner[tone="warning"]')?.getAttribute("heading")).toBe("Only 10 files fit");
  });

  it("says when a dropped file's type is refused, until it is dismissed", () => {
    const { container } = renderPicker(controller([]));
    fireEvent(dropZone(container), new Event("droprejected"));
    const banner = container.querySelector('s-banner[tone="critical"]');
    expect(banner?.getAttribute("heading")).toBe("That file type is not supported.");
    if (banner) fireEvent(banner, new Event("dismiss"));
    expect(container.querySelector("s-banner")).toBeNull();
  });

  it("disables the drop zone once ten files are attached, and not before", () => {
    const nine = Array.from({ length: 9 }, (_, index) => done(`f${index}`));
    expect(dropZone(renderPicker(controller(nine)).container).hasAttribute("disabled")).toBe(false);
    const ten = Array.from({ length: 10 }, (_, index) => done(`g${index}`));
    expect(dropZone(renderPicker(controller(ten)).container).hasAttribute("disabled")).toBe(true);
  });

  it("emits only the finished uploads' ids for the action", async () => {
    const { container } = renderPicker(controller([done("a"), row("b", { status: "uploading" }), row("c", { status: "failed", reason: "x" }), done("d")]));
    await act(async () => undefined);
    const field = container.querySelector('input[name="uploadIds"]');
    expect(field).toBeInstanceOf(HTMLInputElement);
    expect(field instanceof HTMLInputElement ? field.value : "").toBe("up_a,up_d");
  });
});
