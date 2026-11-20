import { firesio } from "~/firesio.server";

/** `GET /sw.js`: the phone app's service worker (Web Push, and a notification click that opens only a page the deny-list allows). */
export const loader = () => firesio.devices().serviceWorker();
