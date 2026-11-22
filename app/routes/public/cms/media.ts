import type { LoaderFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/** `/cms/media/:key`: an image uploaded for the app's content (R2 `UPLOADS`, `cms/<key>`), cached a year, `nosniff`. */
export const loader = (args: LoaderFunctionArgs) => firesio.cms.image(args);
