// The support file staging route (no page): the file pickers of the new-ticket and reply pages stream each file here. It sits UNDER
// the /app layout, so `firesio.adminMiddleware` authenticates the request and sets the support context before it runs; its address
// is `paths.supportUpload` in `app/firesio.server.ts` (`SUPPORT_UPLOAD_PATH` of `@firesio/app/shell`).
export { action, loader } from "@firesio/app/ui/support/upload";
