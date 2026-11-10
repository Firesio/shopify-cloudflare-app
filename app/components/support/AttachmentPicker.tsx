import { useRef, useState } from "react";
import type { UploadController } from "~/routes/app/support/use-pending-uploads";
import { ATTACHMENT_ACCEPT_ATTRIBUTE, MAX_FILES, fileExtensionLabel } from "~/support/attachment";
import { occupiedCount, type UploadRow } from "~/support/upload-rows";
import { useElementEvent } from "~/admin/use-element-event";

/** Every string the picker shows, translated by the route; none baked in. */
export interface AttachmentPickerLabels {
  readonly label: string;
  /** The limits line: the maximum number of files and each size limit, already interpolated. */
  readonly limits: string;
  /** Said when a pick had more valid files than there was room for. */
  readonly skipped: string;
  /** Said when a drop included a file type the server would refuse. */
  readonly typeRejected: string;
  readonly uploading: (filename: string) => string;
  readonly remove: (filename: string) => string;
  /** The heading of the banner for a file that failed, naming the file. */
  readonly failed: (filename: string) => string;
  /** The specific reason, from the upload route's error code. */
  readonly reason: (reason: string) => string;
}

type AttachmentPickerProps = {
  uploads: UploadController;
  labels: AttachmentPickerLabels;
  /** Sizes are formatted by the route in the reader's language. */
  formatSize: (sizeBytes: number) => string;
  /** The drop zone is shown but takes nothing: the page it sits on is still loading what the files will be attached to. */
  disabled?: boolean;
};

type RowProps = {
  row: UploadRow;
  labels: AttachmentPickerLabels;
  formatSize: (sizeBytes: number) => string;
  onRemove: () => void;
};

/** An image shows itself; anything else shows what it is. */
function RowGraphic({ row }: { row: UploadRow }) {
  if (row.kind === "image" && row.previewUrl) {
    return <s-thumbnail src={row.previewUrl} alt={row.filename} size="small"></s-thumbnail>;
  }
  return <s-badge>{fileExtensionLabel(row.filename)}</s-badge>;
}

function FileRow({ row, labels, formatSize, onRemove }: RowProps) {
  const uploading = row.state.status === "uploading";
  return (
    <s-grid gridTemplateColumns="auto 1fr auto" gap="small" alignItems="center">
      <RowGraphic row={row} />
      <s-stack direction="block" gap="small-500">
        <s-paragraph lineClamp={1}>{row.filename}</s-paragraph>
        <s-text color="subdued">{formatSize(row.sizeBytes)}</s-text>
      </s-stack>
      {uploading ? (
        <s-spinner size="base" accessibilityLabel={labels.uploading(row.filename)}></s-spinner>
      ) : (
        <s-button
          type="button"
          variant="tertiary"
          icon="x"
          accessibilityLabel={labels.remove(row.filename)}
          onClick={onRemove}
        ></s-button>
      )}
    </s-grid>
  );
}

type DismissibleBannerProps = {
  heading: string;
  onDismiss: () => void;
  children?: React.ReactNode;
};

/** A critical banner the merchant can close. The `dismiss` event is listened for on the element: see `useElementEvent`. */
function DismissibleBanner({ heading, onDismiss, children }: DismissibleBannerProps) {
  const banner = useRef<HTMLElementTagNameMap["s-banner"]>(null);
  useElementEvent(banner, "dismiss", onDismiss);
  return (
    <s-banner ref={banner} tone="critical" heading={heading} dismissible>
      {children}
    </s-banner>
  );
}

/**
 * The files being attached: a drop zone, then one row per file with its own status.
 *
 * A file that failed is an `s-banner` of its own naming the file and the specific reason, dismissible, so one
 * failure never hides another and the reason is announced. Emits the hidden `uploadIds` field the action reads
 * (finished uploads only).
 *
 * Verified by hand only: the drop zone, thumbnails and banners are Polaris custom elements.
 */
export function AttachmentPicker({ uploads, labels, formatSize, disabled = false }: AttachmentPickerProps) {
  const [typeRejected, setTypeRejected] = useState(false);
  const full = occupiedCount(uploads.rows) >= MAX_FILES;
  const zone = useRef<HTMLElementTagNameMap["s-drop-zone"]>(null);
  const failed = uploads.rows.filter((row) => row.state.status === "failed");
  const listed = uploads.rows.filter((row) => row.state.status !== "failed");

  useElementEvent(zone, "change", () => {
    const element = zone.current;
    if (!element) return;
    setTypeRejected(false);
    void uploads.add(element.files);
    // The zone holds its selection until cleared; ours lives in the rows below.
    element.value = "";
  });
  useElementEvent(zone, "droprejected", () => setTypeRejected(true));

  return (
    <s-stack direction="block" gap="small">
      <s-drop-zone ref={zone} label={labels.label} accept={ATTACHMENT_ACCEPT_ATTRIBUTE} multiple disabled={full || disabled}></s-drop-zone>
      <s-text color="subdued">{labels.limits}</s-text>

      {uploads.skipped > 0 && <s-banner tone="warning" heading={labels.skipped}></s-banner>}
      {typeRejected && <DismissibleBanner heading={labels.typeRejected} onDismiss={() => setTypeRejected(false)} />}

      {failed.map((row) => (
        <DismissibleBanner key={row.key} heading={labels.failed(row.filename)} onDismiss={() => uploads.remove(row.key)}>
          <s-paragraph>{row.state.status === "failed" ? labels.reason(row.state.reason) : ""}</s-paragraph>
        </DismissibleBanner>
      ))}

      {listed.length > 0 && (
        <s-stack direction="block" gap="small-300">
          {listed.map((row) => (
            <FileRow key={row.key} row={row} labels={labels} formatSize={formatSize} onRemove={() => uploads.remove(row.key)} />
          ))}
        </s-stack>
      )}

      <input type="hidden" name="uploadIds" value={uploads.uploadIds.join(",")} />
    </s-stack>
  );
}
