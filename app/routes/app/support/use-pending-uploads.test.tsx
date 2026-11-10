import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePendingUploads } from "./use-pending-uploads";

function setupHook(ticketId?: string) {
  let controller: ReturnType<typeof usePendingUploads> | undefined;
  function Harness() {
    controller = usePendingUploads(ticketId);
    return null;
  }
  const view = render(<Harness />);
  return {
    get: () => {
      if (!controller) throw new Error("Hook did not render");
      return controller;
    },
    unmount: view.unmount,
  };
}

class TestFileList implements FileList {
  [index: number]: File;
  readonly length: number;
  constructor(files: readonly File[]) {
    this.length = files.length;
    for (const [index, file] of files.entries()) this[index] = file;
  }
  item(index: number): File | null { return this[index] ?? null; }
  [Symbol.iterator](): ArrayIterator<File> {
    return Array.from({ length: this.length }, (_, index) => this[index]).values();
  }
}

function fileList(files: readonly File[]): FileList { return new TestFileList(files); }
function uploadFile(name: string, type = "image/png"): File { return new File(["abc"], name, { type }); }

// The tests below replace `URL` with a stand-in that only has the two object-URL methods. `restoreAllMocks` does not undo
// `stubGlobal`, and the dom project shares one jsdom per worker across files (`isolate: false`), so the original `URL` is
// put back here or every later file in that worker loses its URL constructor. (`unstubAllGlobals` would also remove the
// outbound-network guard that app/test/dom-outbound-guard.setup.ts stubs, so it is not used.)
const originalUrl = globalThis.URL;
afterEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("URL", originalUrl);
});

const stored = (uploadId: string, filename = "shot.png") =>
  new Response(JSON.stringify({ uploadId, r2Key: `support/${uploadId}`, filename, contentType: "image/png", sizeBytes: 3 }), { status: 200 });

const stubObjectUrls = () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", { createObjectURL: vi.fn((file: File) => `blob:${file.name}`), revokeObjectURL: revoke });
  return revoke;
};

describe("usePendingUploads", () => {
  it("uploads a file with streaming headers and keeps it as a finished row with its preview", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(stored("up_1"));
    stubObjectUrls();
    const hook = setupHook("ticket_1");
    await act(async () => hook.get().add(fileList([uploadFile("shot.png")])));
    expect(fetchMock).toHaveBeenCalledWith("/support/upload", expect.objectContaining({ method: "POST", headers: { "Content-Type": "image/png", "X-Support-Filename": "shot.png", "X-Support-Ticket": "ticket_1" } }));
    expect(hook.get().rows[0]).toMatchObject({ filename: "shot.png", kind: "image", previewUrl: "blob:shot.png", state: { status: "done", uploadId: "up_1" } });
    expect(hook.get().uploadIds).toEqual(["up_1"]);
    expect(hook.get().busy).toBe(false);
  });

  it("percent-encodes the filename, which the server decodes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(stored("up_1"));
    stubObjectUrls();
    const hook = setupHook();
    await act(async () => hook.get().add(fileList([uploadFile("注文 一覧.png")])));
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("X-Support-Filename")).toBe(encodeURIComponent("注文 一覧.png"));
  });

  it("is busy while a file is on its way, and the row says so", async () => {
    let finish: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    stubObjectUrls();
    const hook = setupHook();
    let adding: Promise<void> = Promise.resolve();
    await act(async () => { adding = hook.get().add(fileList([uploadFile("shot.png")])); });
    expect(hook.get().busy).toBe(true);
    expect(hook.get().rows[0]?.state).toEqual({ status: "uploading" });
    expect(hook.get().uploadIds).toEqual([]);
    await act(async () => { finish(stored("up_1")); await adding; });
    expect(hook.get().busy).toBe(false);
  });

  it("maps malformed successful JSON to a failed row with upload_failed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    stubObjectUrls();
    const hook = setupHook();
    await act(async () => hook.get().add(fileList([uploadFile("shot.png")])));
    expect(hook.get().rows[0]?.state).toEqual({ status: "failed", reason: "upload_failed" });
    expect(hook.get().uploadIds).toEqual([]);
  });

  it("maps rejected uploads to the server's reason", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "too_large" }), { status: 413 }));
    stubObjectUrls();
    const hook = setupHook();
    await act(async () => hook.get().add(fileList([uploadFile("shot.png")])));
    expect(hook.get().rows[0]?.state).toEqual({ status: "failed", reason: "too_large" });
  });

  it("maps transport failures to upload_failed without rejecting add", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    stubObjectUrls();
    const hook = setupHook();
    await act(async () => expect(hook.get().add(fileList([uploadFile("shot.png")]))).resolves.toBeUndefined());
    expect(hook.get().rows[0]?.state).toEqual({ status: "failed", reason: "upload_failed" });
  });

  it("refuses an invalid file before any request and says why on that file", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const hook = setupHook();
    await act(async () => hook.get().add(fileList([uploadFile("script.exe", "application/x-msdownload")])));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hook.get().rows[0]).toMatchObject({ filename: "script.exe", previewUrl: null, state: { status: "failed", reason: "unsupported_type" } });
  });

  it("keeps every failure on its own row instead of only the last", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const name = decodeURIComponent(new Headers(init?.headers).get("X-Support-Filename") ?? "");
      return name === "big.png" ? new Response(JSON.stringify({ error: "too_large" }), { status: 413 }) : stored("up_ok", name);
    });
    stubObjectUrls();
    const hook = setupHook();
    await act(async () => hook.get().add(fileList([uploadFile("big.png"), uploadFile("fine.png"), uploadFile("run.exe", "application/x-msdownload")])));
    const states = Object.fromEntries(hook.get().rows.map((row) => [row.filename, row.state.status === "failed" ? row.state.reason : row.state.status]));
    expect(states).toEqual({ "big.png": "too_large", "fine.png": "done", "run.exe": "unsupported_type" });
    expect(hook.get().uploadIds).toEqual(["up_ok"]);
  });

  it("keeps at most ten uploads and reports how many valid files did not fit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const name = new Headers(init?.headers).get("X-Support-Filename") ?? "file.png";
      return stored(name, name);
    });
    const revoke = stubObjectUrls();
    const hook = setupHook();
    await act(async () => hook.get().add(fileList(Array.from({ length: 12 }, (_, index) => uploadFile(`file-${index}.png`)))));
    expect(hook.get().uploadIds).toHaveLength(10);
    expect(hook.get().skipped).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(10);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("counts files from an earlier pick toward the maximum", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const name = new Headers(init?.headers).get("X-Support-Filename") ?? "file.png";
      return stored(name, name);
    });
    stubObjectUrls();
    const hook = setupHook();
    await act(async () => hook.get().add(fileList(Array.from({ length: 8 }, (_, index) => uploadFile(`a-${index}.png`)))));
    await act(async () => hook.get().add(fileList(Array.from({ length: 4 }, (_, index) => uploadFile(`b-${index}.png`)))));
    expect(hook.get().uploadIds).toHaveLength(10);
    expect(hook.get().skipped).toBe(2);
  });

  it("revokes object URLs when removing and resetting uploads", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => stored("up_1"));
    const revoke = stubObjectUrls();
    const first = setupHook();
    await act(async () => first.get().add(fileList([uploadFile("shot.png")])));
    const key = first.get().rows[0]?.key ?? "";
    act(() => first.get().remove(key));
    expect(revoke).toHaveBeenCalledWith("blob:shot.png");
    expect(first.get().rows).toEqual([]);
    first.unmount();
    const second = setupHook();
    await act(async () => second.get().add(fileList([uploadFile("shot.png")])));
    act(() => second.get().reset());
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(second.get().rows).toEqual([]);
    second.unmount();
  });

  it("does not upload files still waiting when the form is reset", async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    stubObjectUrls();
    const hook = setupHook();
    let adding: Promise<void> = Promise.resolve();
    await act(async () => { adding = hook.get().add(fileList([uploadFile("one.png"), uploadFile("two.png")])); });
    act(() => hook.get().reset());
    await act(async () => { finish(stored("up_1")); await adding; });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hook.get().rows).toEqual([]);
    expect(hook.get().uploadIds).toEqual([]);
  });
});
