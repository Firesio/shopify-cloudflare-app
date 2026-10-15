import type { PushMessage } from "../../types";
import { FALLBACK_PATH, toInternalPath } from "./internal-path";

/**
 * Lengths are in characters, chosen so the JSON stays far under the ~4 KB a push service accepts after encryption
 * even when every character is four bytes. The service worker clips to 120 / 300 as well, so these are the tighter
 * bound and the device never sees a cut mid-word that the server did not make.
 */
export const MAX_TITLE = 100;
export const MAX_BODY = 240;
const MAX_TAG = 64;

/** Whitespace and control characters become single spaces; an over-long text is cut at a character, with an ellipsis. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/[\p{Cc}\s]+/gu, " ").trim();
  const characters = Array.from(flat);
  return characters.length <= max ? flat : `${characters.slice(0, max - 1).join("").trimEnd()}…`;
}

/**
 * The text the device decrypts: `{ title, body, url, tag, topic }`, which is exactly what `public/internal-sw.js`
 * reads. The url is re-checked here even though the composer built it, because this is the last step before the wire.
 */
export function encodePushPayload(message: PushMessage): string {
  return JSON.stringify({
    title: clip(message.title, MAX_TITLE),
    body: clip(message.body, MAX_BODY),
    url: toInternalPath(message.url || FALLBACK_PATH),
    tag: clip(message.tag, MAX_TAG),
    topic: clip(message.topic, MAX_TAG),
  });
}
