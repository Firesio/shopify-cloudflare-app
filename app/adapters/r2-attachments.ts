import { chunkKeys } from "@firesio/shopify";
import type { AttachmentStore, UploadBody } from "@firesio/support";

/** Read a body up to `maxBytes`; `null` when it is longer (nothing is stored then). R2 needs the length of what it receives. */
async function readBounded(body: UploadBody, maxBytes: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (body instanceof ArrayBuffer) return body.byteLength > maxBytes ? null : new Uint8Array(body);
  if (body instanceof Uint8Array) return body.byteLength > maxBytes ? null : new Uint8Array(body);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

/** The attachment bytes in R2 (`UPLOADS`). A body over `maxBytes` is refused as an error, so the caller discards the staged row. */
export function r2Attachments(bucket: R2Bucket): AttachmentStore {
  return {
    async put(key, body, meta) {
      const bytes = await readBounded(body, meta.maxBytes);
      if (bytes === null) throw new RangeError("attachment larger than the allowed size");
      await bucket.put(key, bytes, { httpMetadata: { contentType: meta.contentType } });
      return { sizeBytes: bytes.byteLength };
    },
    async delete(keys) {
      for (const chunk of chunkKeys(keys)) await bucket.delete([...chunk]);
    },
  };
}
