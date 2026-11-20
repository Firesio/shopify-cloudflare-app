import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

// The page a campaign mail's "unsubscribe" link opens (public: a person must always be able to stop the mail). A GET shows a button and
// changes nothing (mail scanners open links); a POST, or a mail client's one-click POST, unsubscribes. A forged link answers like a real one.
export const loader = ({ request }: Pick<LoaderFunctionArgs, "request">) => firesio.campaigns().unsubscribe(request);
export const action = ({ request }: Pick<ActionFunctionArgs, "request">) => firesio.campaigns().unsubscribe(request);
