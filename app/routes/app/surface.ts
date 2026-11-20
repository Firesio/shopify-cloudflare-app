// The route the page's `SurfaceReporter` posts to (a resource route, no page), under the /app layout so the admin guard has already
// set the surface context. Held by `app/surface.test.ts` (`reportRouteFindings`); the preset cannot mount it: `app/routes.ts` is the app's.
export { action, loader } from "@firesio/app/ui/surface/report";
