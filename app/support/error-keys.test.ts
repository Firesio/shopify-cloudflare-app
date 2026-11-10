import { describe, expect, it } from "vitest";
import { FIELD_ERROR_CODES } from "./field-errors";
import { fieldErrorKey, supportErrorKey } from "./error-keys";

describe("supportErrorKey", () => {
  it("has its own message for a reply whose attachments went missing", () => {
    expect(supportErrorKey("invalid_upload")).toBe("support.errors.invalid_upload");
  });

  it("maps the upload route's empty to a failed upload and any unknown reason to the generic one", () => {
    expect(supportErrorKey("empty")).toBe("support.errors.upload_failed");
    expect(supportErrorKey("something_new")).toBe("support.errors.upload_failed");
  });
});

describe("fieldErrorKey", () => {
  it("has a message for every code the form can produce", () => {
    for (const code of FIELD_ERROR_CODES) expect(fieldErrorKey(code)).toBe(`support.fieldErrors.${code}`);
  });
});
