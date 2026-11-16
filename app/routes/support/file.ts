import { firesio } from "~/firesio.server";
import type { Route } from "./+types/file";

/**
 * One file of a support ticket (`/support/file/:id?token=`), outside `/app`: an image in a thread or a link in a mail is asked
 * for with no session, so the signed token in the URL is the authorisation. The preset answers 404 for anything wrong.
 */
export function loader({ request, params }: Route.LoaderArgs) {
  return firesio.supportFile(request, params.id);
}
