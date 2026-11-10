import { useCallback, useEffect, useRef, useState } from "react";
import { storedUploadSchema } from "~/schemas/support-upload";
import { MAX_FILES } from "~/support/attachment";
import {
  emptyUploadList,
  finishedUploadIds,
  hasUploadInFlight,
  occupiedCount,
  planPick,
  uploadListReducer,
  type UploadAction,
  type UploadList,
  type UploadRow,
} from "~/support/upload-rows";

export interface UploadController {
  /** Every file the merchant picked, with its own status, in the order picked. */
  readonly rows: readonly UploadRow[];
  /** The finished uploads' ids, which is what the message adopts. */
  readonly uploadIds: readonly string[];
  /** True while any file is still on its way: the message must not be sent yet. */
  readonly busy: boolean;
  /** Valid files the last pick could not fit under the maximum. */
  readonly skipped: number;
  add(files: ArrayLike<File> | null): Promise<void>;
  remove(key: string): void;
  reset(): void;
}

type StoredUpload = NonNullable<ReturnType<typeof parseStored>>;

function parseStored(payload: unknown) {
  const parsed = storedUploadSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

/** The server's reason for refusing an upload, or a generic one. */
async function failureReason(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : "upload_failed";
}

type UploadOutcome =
  | { readonly ok: true; readonly stored: StoredUpload }
  | { readonly ok: false; readonly reason: string };

/** Streams one file to the upload route; never throws. */
async function uploadFile(file: File, ticketId?: string, shop?: string): Promise<UploadOutcome> {
  let response: Response;
  try {
    response = await fetch("/support/upload", {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type,
        "X-Support-Filename": encodeURIComponent(file.name),
        ...(ticketId ? { "X-Support-Ticket": ticketId } : {}),
        ...(shop ? { "X-Shop": shop } : {}),
      },
    });
  } catch {
    return { ok: false, reason: "upload_failed" };
  }
  if (!response.ok) return { ok: false, reason: await failureReason(response) };
  const stored = parseStored(await response.json().catch(() => null));
  return stored ? { ok: true, stored } : { ok: false, reason: "upload_failed" };
}

function revoke(rows: readonly UploadRow[]) {
  for (const row of rows) if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
}

/**
 * The files being attached to one message.
 *
 * State is mirrored in a ref and updated synchronously, so two picks made in quick
 * succession both see the files already queued and the maximum holds.
 */
export function usePendingUploads(ticketId?: string, shop?: string): UploadController {
  const [list, setList] = useState<UploadList>(emptyUploadList);
  const current = useRef<UploadList>(emptyUploadList);

  const apply = useCallback((action: UploadAction) => {
    const before = current.current;
    const next = uploadListReducer(before, action);
    current.current = next;
    setList(next);
    // A row that left the list takes its preview with it.
    revoke(before.rows.filter((row) => !next.rows.some((kept) => kept.key === row.key)));
  }, []);

  const add = useCallback(async (picked: ArrayLike<File> | null) => {
    if (!picked || picked.length === 0) return;
    const files = Array.from(picked);
    const plan = planPick({
      picked: files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
      occupied: occupiedCount(current.current.rows),
      max: MAX_FILES,
    });

    const queued = plan.accepted.flatMap(({ index, kind }) => {
      const file = files[index];
      return file ? [{ file, row: { key: crypto.randomUUID(), filename: file.name, sizeBytes: file.size, kind, previewUrl: URL.createObjectURL(file), state: { status: "uploading" } } satisfies UploadRow }] : [];
    });
    const refused: UploadRow[] = plan.rejected.flatMap(({ index, reason }) => {
      const file = files[index];
      return file ? [{ key: crypto.randomUUID(), filename: file.name, sizeBytes: file.size, kind: null, previewUrl: null, state: { status: "failed", reason } }] : [];
    });
    apply({ type: "picked", rows: [...refused, ...queued.map((entry) => entry.row)], skipped: plan.skipped });

    for (const { file, row } of queued) {
      // Reset or removal while earlier files were uploading: do not upload what nobody is waiting for.
      if (!current.current.rows.some((existing) => existing.key === row.key)) continue;
      const outcome = await uploadFile(file, ticketId, shop);
      if (outcome.ok) {
        apply({ type: "uploaded", key: row.key, uploadId: outcome.stored.uploadId, r2Key: outcome.stored.r2Key, contentType: outcome.stored.contentType });
      } else {
        apply({ type: "failed", key: row.key, reason: outcome.reason });
      }
    }
  }, [apply, ticketId, shop]);

  const remove = useCallback((key: string) => apply({ type: "removed", key }), [apply]);
  const reset = useCallback(() => apply({ type: "reset" }), [apply]);

  useEffect(() => () => revoke(current.current.rows), []);

  return {
    rows: list.rows,
    uploadIds: finishedUploadIds(list.rows),
    busy: hasUploadInFlight(list.rows),
    skipped: list.skipped,
    add,
    remove,
    reset,
  };
}
