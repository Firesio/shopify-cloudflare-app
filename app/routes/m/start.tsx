import { default as StartPage, meta as startMeta } from "@firesio/app/ui/devices/start";
import type { StartPageData } from "@firesio/app/ui/devices";
import type { LoaderFunctionArgs, MetaDescriptor } from "react-router";
import { firesio } from "~/firesio.server";
import { phoneHead } from "./page-head";

/** `GET /m/start`: the pairing screen, where a phone with no live session is sent. Public. */
export const loader = ({ request }: LoaderFunctionArgs) => firesio.devices().startPage(request);

export function meta(args: { readonly data: StartPageData | undefined }): MetaDescriptor[] {
  return [...startMeta(args), ...phoneHead(args.data)];
}

export default StartPage;
