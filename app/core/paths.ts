/**
 * Addresses the preset must know because it builds links or forms to them, declared once: `app/firesio.server.ts` passes them as
 * `paths` and `app/routes.ts` mounts the route there (`app/routes.test.ts` holds the two together). The other `paths` keep the
 * preset's defaults, which are where `app/routes.ts` mounts those pages.
 */

/** The support file staging route (`@firesio/app/ui/support/upload`), under the /app layout: the pages' file picker posts here. */
export const SUPPORT_UPLOAD_PATH = "/app/support/upload";
