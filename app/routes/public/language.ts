import type { LoaderFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/** `/language/:language?next=/path`: remembers the language the visitor chose and sends them to that page in it (the language switch is a plain link to this). */
export const loader = (args: LoaderFunctionArgs) => firesio.languageSwitch(args);
