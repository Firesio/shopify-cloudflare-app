import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { findAvailablePort } from "./localhost-port.mjs";

function listen(port = 0, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ host, port }, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("skips a localhost port that is already in use", async () => {
  const server = await listen();
  const address = server.address();
  assert.equal(typeof address, "object");
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port");

  try {
    const selected = await findAvailablePort(address.port, 2);
    assert.notEqual(selected, address.port);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("skips a port held on the IPv6 loopback only", async (t) => {
  let server;
  try {
    server = await listen(0, "::1");
  } catch (error) {
    if (error?.code === "EADDRNOTAVAIL" || error?.code === "EAFNOSUPPORT") return t.skip("no IPv6 loopback here");
    throw error;
  }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port");

  try {
    const selected = await findAvailablePort(address.port, 2);
    assert.notEqual(selected, address.port);
  } finally {
    await close(server);
  }
});
