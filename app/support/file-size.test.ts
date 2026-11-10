import { describe, expect, it } from "vitest";
import { formatFileSize, formatLimit } from "./file-size";

describe("formatFileSize", () => {
  it("shows kilobytes below a megabyte, never zero for a file that has bytes", () => {
    expect(formatFileSize("en", 1)).toBe("1 kB");
    expect(formatFileSize("en", 2048)).toBe("2 kB");
    expect(formatFileSize("en", 1024 * 1024 - 1)).toBe("1,024 kB");
  });

  it("shows megabytes from one megabyte, with one decimal", () => {
    expect(formatFileSize("en", 1024 * 1024)).toBe("1 MB");
    expect(formatFileSize("en", 1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("uses the reader's decimal mark and unit word", () => {
    expect(formatFileSize("es", 1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});

describe("formatLimit", () => {
  it("states a byte limit in whole megabytes", () => {
    expect(formatLimit("en", 10 * 1024 * 1024)).toBe("10 MB");
    expect(formatLimit("en", 100 * 1024 * 1024)).toBe("100 MB");
    expect(formatLimit("es", 25 * 1024 * 1024)).toBe("25 MB");
  });
});
