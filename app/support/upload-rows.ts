import { validateUpload, type AttachmentKind, type UploadRejection } from "~/support/attachment";

/**
 * The files a merchant has picked for one message, one row each, from the moment
 * they are chosen until the message is sent.
 *
 * Pure: the hook that streams the bytes owns the side effects (fetch, object
 * URLs); this owns the decisions, so "which of these do we accept, how many fit,
 * what does a failure do to the list" is testable with no browser.
 */
export type UploadRow = {
  /** Local identity of the row; the server's upload id only exists once the upload is done. */
  readonly key: string;
  readonly filename: string;
  readonly sizeBytes: number;
  /** Null for a file refused before it was ever read. */
  readonly kind: AttachmentKind | null;
  /** An object URL for a local preview, or null when the file was refused. */
  readonly previewUrl: string | null;
  readonly state: UploadState;
};

export type UploadState =
  | { readonly status: "uploading" }
  | { readonly status: "done"; readonly uploadId: string; readonly r2Key: string; readonly contentType: string }
  | { readonly status: "failed"; readonly reason: string };

export type PickedFile = { readonly name: string; readonly type: string; readonly size: number };

export type PickPlan = {
  /** Indexes into the picked list that are valid and have a free slot. */
  readonly accepted: readonly { readonly index: number; readonly kind: AttachmentKind }[];
  /** Indexes refused by the allowlist or size rules, with the reason. */
  readonly rejected: readonly { readonly index: number; readonly reason: UploadRejection }[];
  /** Valid files that did not fit under the maximum. Never dropped silently: the picker reports the number. */
  readonly skipped: number;
};

/**
 * Sort a pick into accepted, refused and "no room".
 *
 * A refused file takes no slot, so one bad file in a batch never costs a good one
 * its place. `occupied` counts files that are uploading or done; a failed row is
 * only a message, and does not hold a slot.
 */
export function planPick({ picked, occupied, max }: { picked: readonly PickedFile[]; occupied: number; max: number }): PickPlan {
  const accepted: { index: number; kind: AttachmentKind }[] = [];
  const rejected: { index: number; reason: UploadRejection }[] = [];
  let free = Math.max(0, max - occupied);
  let skipped = 0;

  picked.forEach((file, index) => {
    const check = validateUpload({ contentType: file.type, sizeBytes: file.size });
    if (!check.ok) {
      rejected.push({ index, reason: check.reason });
      return;
    }
    if (free === 0) {
      skipped += 1;
      return;
    }
    free -= 1;
    accepted.push({ index, kind: check.value.kind });
  });

  return { accepted, rejected, skipped };
}

export type UploadList = {
  readonly rows: readonly UploadRow[];
  /** How many valid files the LAST pick could not fit; cleared by the next pick, a removal or a reset. */
  readonly skipped: number;
};

export const emptyUploadList: UploadList = { rows: [], skipped: 0 };

export type UploadAction =
  | { readonly type: "picked"; readonly rows: readonly UploadRow[]; readonly skipped: number }
  | { readonly type: "uploaded"; readonly key: string; readonly uploadId: string; readonly r2Key: string; readonly contentType: string }
  | { readonly type: "failed"; readonly key: string; readonly reason: string }
  | { readonly type: "removed"; readonly key: string }
  | { readonly type: "reset" };

function withState(rows: readonly UploadRow[], key: string, state: UploadState): UploadRow[] {
  return rows.map((row) => (row.key === key ? { ...row, state } : row));
}

export function uploadListReducer(list: UploadList, action: UploadAction): UploadList {
  switch (action.type) {
    case "picked":
      return { rows: [...list.rows, ...action.rows], skipped: action.skipped };
    case "uploaded":
      return { ...list, rows: withState(list.rows, action.key, { status: "done", uploadId: action.uploadId, r2Key: action.r2Key, contentType: action.contentType }) };
    case "failed":
      return { ...list, rows: withState(list.rows, action.key, { status: "failed", reason: action.reason }) };
    case "removed":
      return { rows: list.rows.filter((row) => row.key !== action.key), skipped: 0 };
    case "reset":
      return emptyUploadList;
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Rows that hold a slot toward the maximum. */
export function occupiedCount(rows: readonly UploadRow[]): number {
  return rows.filter((row) => row.state.status !== "failed").length;
}

/** True while any file is still on its way: the message must not be sent yet. */
export function hasUploadInFlight(rows: readonly UploadRow[]): boolean {
  return rows.some((row) => row.state.status === "uploading");
}

/** The ids the message adopts: finished uploads only, in the order they were picked. */
export function finishedUploadIds(rows: readonly UploadRow[]): string[] {
  return rows.flatMap((row) => (row.state.status === "done" ? [row.state.uploadId] : []));
}
