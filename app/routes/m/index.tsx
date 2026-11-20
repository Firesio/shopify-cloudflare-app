import { default as InstallPage, meta as installMeta } from "@firesio/app/ui/devices/install";
import type { StartPageData } from "@firesio/app/ui/devices";
import type { LoaderFunctionArgs, MetaDescriptor } from "react-router";
import { firesio } from "~/firesio.server";
import { phoneHead } from "./page-head";

/** `GET /m`: how to put the phone app on this phone. Public. */
export const loader = ({ request }: LoaderFunctionArgs) => firesio.devices().startPage(request);

export function meta(args: { readonly data: StartPageData | undefined }): MetaDescriptor[] {
  return [...installMeta(args), ...phoneHead(args.data)];
}

export default InstallPage;
