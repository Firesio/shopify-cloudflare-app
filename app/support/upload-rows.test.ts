import { describe, expect, it } from "vitest";
import { FILE_MAX_BYTES, IMAGE_MAX_BYTES } from "./attachment";
import {
  emptyUploadList,
  finishedUploadIds,
  hasUploadInFlight,
  occupiedCount,
  planPick,
  uploadListReducer,
  type UploadList,
  type UploadRow,
} from "./upload-rows";

const png = (name = "shot.png", size = 1024) => ({ name, type: "image/png", size });

const row = (key: string, state: UploadRow["state"], over: Partial<UploadRow> = {}): UploadRow => ({
  key,
  filename: `${key}.png`,
  sizeBytes: 10,
  kind: "image",
  previewUrl: `blob:${key}`,
  state,
  ...over,
});

describe("planPick", () => {
  it("accepts valid files in order and reports each one's kind", () => {
    const plan = planPick({ picked: [png(), { name: "a.csv", type: "text/csv", size: 5 }, { name: "v.mp4", type: "video/mp4", size: 5 }], occupied: 0, max: 10 });
    expect(plan.accepted).toEqual([{ index: 0, kind: "image" }, { index: 1, kind: "file" }, { index: 2, kind: "video" }]);
    expect(plan.rejected).toEqual([]);
    expect(plan.skipped).toBe(0);
  });

  it("names the reason for each refused file", () => {
    const plan = planPick({
      picked: [
        { name: "x.exe", type: "application/x-msdownload", size: 5 },
        { name: "big.png", type: "image/png", size: IMAGE_MAX_BYTES + 1 },
        { name: "big.csv", type: "text/csv", size: FILE_MAX_BYTES + 1 },
        { name: "empty.png", type: "image/png", size: 0 },
        { name: "heic.heic", type: "image/heic", size: 5 },
      ],
      occupied: 0,
      max: 10,
    });
    expect(plan.rejected.map((entry) => entry.reason)).toEqual(["unsupported_type", "too_large", "too_large", "empty", "unsupported_type"]);
    expect(plan.accepted).toEqual([]);
  });

  it("takes only as many as there is room for and counts the rest, instead of dropping them silently", () => {
    const picked = Array.from({ length: 12 }, (_, index) => png(`${index}.png`));
    const plan = planPick({ picked, occupied: 3, max: 10 });
    expect(plan.accepted.map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(plan.skipped).toBe(5);
  });

  it("lets a refused file cost no place, so one bad file never displaces a good one", () => {
    const plan = planPick({ picked: [{ name: "x.exe", type: "application/x-msdownload", size: 5 }, png("a.png"), png("b.png")], occupied: 8, max: 10 });
    expect(plan.accepted.map((entry) => entry.index)).toEqual([1, 2]);
    expect(plan.skipped).toBe(0);
    expect(plan.rejected).toHaveLength(1);
  });

  it("skips everything valid when the message is already full", () => {
    const plan = planPick({ picked: [png(), png("b.png")], occupied: 10, max: 10 });
    expect(plan.accepted).toEqual([]);
    expect(plan.skipped).toBe(2);
  });

  it("never reports a negative room", () => {
    expect(planPick({ picked: [png()], occupied: 14, max: 10 }).skipped).toBe(1);
  });
});

describe("uploadListReducer", () => {
  const uploading = row("a", { status: "uploading" });

  it("adds picked rows after the existing ones and records how many did not fit", () => {
    const first = uploadListReducer(emptyUploadList, { type: "picked", rows: [uploading], skipped: 0 });
    const second = uploadListReducer(first, { type: "picked", rows: [row("b", { status: "uploading" })], skipped: 2 });
    expect(second.rows.map((entry) => entry.key)).toEqual(["a", "b"]);
    expect(second.skipped).toBe(2);
  });

  it("turns an uploading row into a finished one carrying the server's id", () => {
    const list: UploadList = { rows: [uploading, row("b", { status: "uploading" })], skipped: 0 };
    const next = uploadListReducer(list, { type: "uploaded", key: "a", uploadId: "up_1", r2Key: "k", contentType: "image/png" });
    expect(next.rows[0]?.state).toEqual({ status: "done", uploadId: "up_1", r2Key: "k", contentType: "image/png" });
    expect(next.rows[1]?.state).toEqual({ status: "uploading" });
  });

  it("keeps each failure on its own row, so a second failure does not replace the first", () => {
    const list: UploadList = { rows: [uploading, row("b", { status: "uploading" })], skipped: 0 };
    const afterA = uploadListReducer(list, { type: "failed", key: "a", reason: "too_large" });
    const afterB = uploadListReducer(afterA, { type: "failed", key: "b", reason: "upload_failed" });
    expect(afterB.rows.map((entry) => entry.state)).toEqual([
      { status: "failed", reason: "too_large" },
      { status: "failed", reason: "upload_failed" },
    ]);
  });

  it("ignores a result for a row that is gone (the form was reset while it uploaded)", () => {
    const next = uploadListReducer(emptyUploadList, { type: "uploaded", key: "ghost", uploadId: "u", r2Key: "k", contentType: "image/png" });
    expect(next).toEqual(emptyUploadList);
  });

  it("removes one row and clears the notice about files that did not fit", () => {
    const list: UploadList = { rows: [uploading, row("b", { status: "uploading" })], skipped: 3 };
    const next = uploadListReducer(list, { type: "removed", key: "a" });
    expect(next.rows.map((entry) => entry.key)).toEqual(["b"]);
    expect(next.skipped).toBe(0);
  });

  it("empties everything on reset", () => {
    expect(uploadListReducer({ rows: [uploading], skipped: 2 }, { type: "reset" })).toEqual(emptyUploadList);
  });
});

describe("derived facts", () => {
  const rows = [
    row("a", { status: "done", uploadId: "up_a", r2Key: "ka", contentType: "image/png" }),
    row("b", { status: "uploading" }),
    row("c", { status: "failed", reason: "too_large" }),
    row("d", { status: "done", uploadId: "up_d", r2Key: "kd", contentType: "image/png" }),
  ];

  it("counts a slot for every file that is uploading or done, and none for a failure", () => {
    expect(occupiedCount(rows)).toBe(3);
  });

  it("is in flight while any file is still uploading", () => {
    expect(hasUploadInFlight(rows)).toBe(true);
    expect(hasUploadInFlight(rows.filter((entry) => entry.key !== "b"))).toBe(false);
    expect(hasUploadInFlight([])).toBe(false);
  });

  it("sends only finished uploads, in the order picked", () => {
    expect(finishedUploadIds(rows)).toEqual(["up_a", "up_d"]);
  });
});
