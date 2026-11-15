import { createServer } from "node:net";

export const DEFAULT_GRAPHIQL_PORT = 3457;
export const DEFAULT_LOCALHOST_PORT = 9293;

function canListenOn(host, port) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      // A machine without IPv6 cannot be holding the port on ::1.
      if (host === "::1" && error?.code === "EADDRNOTAVAIL") resolve(true);
      else reject(error);
    });
    server.listen({ host, port }, () => {
      server.close((error) => (error ? reject(error) : resolve(true)));
    });
  });
}

// "localhost" may resolve to either loopback: another dev server (e.g. a second `shopify app dev`) often holds a port on ::1
// only, which a 127.0.0.1 probe does not see, and the Shopify CLI then refuses the port. Free means free on both.
async function canListen(port) {
  await canListenOn("127.0.0.1", port);
  await canListenOn("::1", port);
  return true;
}

export async function findAvailablePort(preferred = DEFAULT_LOCALHOST_PORT, attempts = 100) {
  if (!Number.isInteger(preferred) || preferred < 1 || preferred > 65535) {
    throw new RangeError(`Invalid localhost port: ${preferred}`);
  }

  for (let offset = 0; offset < attempts && preferred + offset <= 65535; offset += 1) {
    const port = preferred + offset;
    try {
      await canListen(port);
      return port;
    } catch (error) {
      if (error?.code !== "EADDRINUSE" && error?.code !== "EACCES") throw error;
    }
  }

  throw new Error(`No available localhost port found from ${preferred}.`);
}
