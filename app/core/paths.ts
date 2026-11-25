/**
 * Where the two refusal pages of `@firesio/app` 3.10 are mounted: the `paths` option of `app/firesio.server.ts` and the routes of
 * `app/routes.ts` read these, so the two cannot drift (`app/routes.test.ts`). Each is on only when both are present.
 */
export const REFUSAL_PATHS = { blocked: "/app/blocked", requestAccess: "/app/request-access" } as const;
