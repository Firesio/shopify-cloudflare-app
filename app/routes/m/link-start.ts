import type { ActionFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/** `POST /m/api/link/start` `{ shop }`: the phone asks to be paired and gets a short code. Public and same-origin only; rate limited per source (`DEVICE_LINK_LIMITER`). */
export const action = ({ request }: Pick<ActionFunctionArgs, "request">) => firesio.devices().start(request);
