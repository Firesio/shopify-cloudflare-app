import type { TFunction } from "i18next";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import { FILE_MAX_BYTES, IMAGE_MAX_BYTES, MAX_FILES, VIDEO_MAX_BYTES } from "~/support/attachment";
import { supportErrorKey } from "~/support/error-keys";
import { formatFileSize, formatLimit } from "~/support/file-size";
import type { AttachmentPickerLabels } from "./AttachmentPicker";

/**
 * The picker's strings, translated in one place so the new-ticket page and the thread page cannot word the same control
 * differently. The limits line is built from the constants the server enforces, so the text cannot drift from the rule.
 */
export function pickerLabels(
  t: TFunction<readonly ["admin", "common"]>,
  language: LanguageCode,
): { labels: AttachmentPickerLabels; formatSize: (sizeBytes: number) => string } {
  return {
    formatSize: (sizeBytes) => formatFileSize(language, sizeBytes),
    labels: {
      label: t("support.form.attachments"),
      limits: t("support.form.attachmentLimits", {
        max: MAX_FILES,
        image: formatLimit(language, IMAGE_MAX_BYTES),
        video: formatLimit(language, VIDEO_MAX_BYTES),
        file: formatLimit(language, FILE_MAX_BYTES),
      }),
      skipped: t("support.form.attachmentsSkipped", { max: MAX_FILES }),
      typeRejected: t("support.errors.unsupported_type"),
      uploading: (filename) => t("support.form.fileUploading", { filename }),
      remove: (filename) => t("support.form.fileRemove", { filename }),
      failed: (filename) => t("support.form.fileFailed", { filename }),
      reason: (reason) => t(supportErrorKey(reason)),
    },
  };
}
