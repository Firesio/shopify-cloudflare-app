import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { FieldDescription, FieldError } from "~/internal/components/ui/field";
import { Spinner } from "~/internal/components/ui/spinner";
import type { UploadController } from "~/routes/app/support/use-pending-uploads";
import { ATTACHMENT_ACCEPT_ATTRIBUTE, FILE_MAX_BYTES, IMAGE_MAX_BYTES, MAX_FILES, VIDEO_MAX_BYTES } from "~/support/attachment";

const MIB = 1024 * 1024;

/** English-only, like the rest of the console. Each reason is the upload route's error code. */
const FAILURE_TEXT: Readonly<Record<string, string>> = {
  too_large: "is too big",
  unsupported_type: "is not a supported file type",
  empty: "is empty",
};

function failureText(reason: string): string {
  return FAILURE_TEXT[reason] ?? "could not be uploaded";
}

/** The internal console uses shadcn/ui, not Shopify Polaris web components. */
export function InternalAttachmentPicker({ uploads }: { uploads: UploadController }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept={ATTACHMENT_ACCEPT_ATTRIBUTE}
        multiple
        hidden
        onChange={(event) => {
          void uploads.add(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input type="hidden" name="uploadIds" value={uploads.uploadIds.join(",")} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploads.busy} onClick={() => input.current?.click()}>
          {uploads.busy ? <Spinner /> : <Paperclip />}
          {uploads.busy ? "Uploading..." : "Attach files"}
        </Button>
        <FieldDescription>
          Up to {MAX_FILES} files: {IMAGE_MAX_BYTES / MIB} MB images, {VIDEO_MAX_BYTES / MIB} MB video, and {FILE_MAX_BYTES / MIB} MB files
        </FieldDescription>
      </div>

      {uploads.rows.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {uploads.rows.map((row) => (
            <li key={row.key}>
              <Badge variant={row.state.status === "failed" ? "destructive" : "secondary"} className="h-7 gap-1 pr-1 text-sm">
                {row.state.status === "uploading" && <Spinner />}
                <span className="max-w-60 truncate">{row.filename}</span>
                {row.state.status !== "uploading" && (
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${row.filename}`} onClick={() => uploads.remove(row.key)}>
                    <X />
                  </Button>
                )}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {uploads.skipped > 0 && <FieldError>Only {MAX_FILES} files fit in one message. The extra files were not added.</FieldError>}
      {uploads.rows.map((row) =>
        row.state.status === "failed" ? (
          <FieldError key={row.key}>
            {row.filename} {failureText(row.state.reason)}.
          </FieldError>
        ) : null,
      )}
    </div>
  );
}
