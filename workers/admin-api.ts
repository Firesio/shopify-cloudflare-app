import { WorkerEntrypoint } from "cloudflare:workers";
import { defineAdminApi } from "@firesio/portal-client";
import { billingHandlers, shopsHandlers, type AdminApiDeps } from "../app/core/admin-api";
import { createServices } from "../app/wiring/services";

function depsOf(env: Env): AdminApiDeps {
  const s = createServices(env);
  return { shops: s.shops, grants: s.grants, now: s.runtime.now };
}

const admin = defineAdminApi<Env>()
  .shops((env) => shopsHandlers(depsOf(env)))
  .billing((env) => billingHandlers(depsOf(env))).groups;

/**
 * The commands the portal sends, over a service binding (the portal binds this entrypoint by name). One method per group
 * the app supports; `support()` is not defined yet, so the portal reads it as UNSUPPORTED. The Access JWT does not reach this
 * path: the portal passes `actor` in the input.
 */
export class AdminApi extends WorkerEntrypoint<Env> {
  shops() {
    return admin.shops(this.env);
  }

  billing() {
    return admin.billing(this.env);
  }
}
