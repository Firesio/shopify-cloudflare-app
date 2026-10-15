// Generates a VAPID key pair (RFC 8292) for Web Push and prints how to install it. Prints only: it does not write
// files, call Cloudflare or deploy anything. The private key is a secret; run this where the terminal is not logged.
//
//   npm run push:keys
//
// Output format matches what the app expects: both values base64url, public = 65-byte uncompressed P-256 point,
// private = 32-byte scalar.

import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = base64url(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
const jwk = await subtle.exportKey("jwk", pair.privateKey);
const privateKey = jwk.d;
if (publicKey.length !== 87 || typeof privateKey !== "string" || privateKey.length !== 43) {
  throw new Error("unexpected key sizes; refusing to print them");
}

console.log(`VAPID key pair generated.

  VAPID_PUBLIC_KEY  = ${publicKey}
  VAPID_PRIVATE_KEY = ${privateKey}   (SECRET: never commit it)

Local development: add both to .dev.vars

  VAPID_PUBLIC_KEY=${publicKey}
  VAPID_PRIVATE_KEY=${privateKey}

Production:

  1. Public key is a var, not a secret. Set "VAPID_PUBLIC_KEY" under env.production.vars in wrangler.jsonc to:
       ${publicKey}
  2. Private key is a secret:
       npx wrangler secret put VAPID_PRIVATE_KEY --env production
     and paste the private value when prompted.
  3. Deploy with: npm run cf:deploy

Keep the pair: changing it later invalidates every existing browser subscription (they are bound to the public key),
so staff would have to re-enable notifications.`);
