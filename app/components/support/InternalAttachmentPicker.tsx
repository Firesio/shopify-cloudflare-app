import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { FieldDescription, FieldError } from "~/internal/components/ui/field";
import { Spinner } from "~/internal/components/ui/spinner";
import type { UploadController } from "~/routes/app/support/use-pending-uploads";

/** The internal console uses shadcn/ui, not Shopify Polaris web components. */
export function InternalAttachmentPicker({ uploads }: { uploads: UploadController }) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/*,video/*,.csv,.txt,.md,.json,.xml,.pdf,.zip,.gz,.xls,.xlsx,.doc,.docx"
        multiple
        hidden
        onChange={(event) => {
          void uploads.add(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input type="hidden" name="uploadIds" value={uploads.files.map((file) => file.uploadId).join(",")} />

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={uploads.busy} onClick={() => input.current?.click()}>
          {uploads.busy ? <Spinner /> : <Paperclip />}
          {uploads.busy ? "Uploading..." : "Attach files"}
        </Button>
        <FieldDescription>Up to 10 MB images, 100 MB video, and 25 MB files</FieldDescription>
      </div>

      {uploads.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {uploads.files.map((file) => (
            <li key={file.uploadId}>
              <Badge variant="secondary" className="h-7 gap-1 pr-1 text-sm">
                <span className="max-w-60 truncate">{file.filename}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${file.filename}`}
                  onClick={() => uploads.remove(file.uploadId)}
                >
                  <X />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {uploads.error && <FieldError>That file could not be uploaded. Try again.</FieldError>}
    </div>
  );
}
