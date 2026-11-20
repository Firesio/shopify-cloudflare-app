import type { ActionFunctionArgs } from "react-router";
import { firesio } from "~/firesio.server";

/** `POST /m/api/link/poll` `{ device_code }`: has a member confirmed the code? `approved` sets the phone's cookie. Public and same-origin only. */
export const action = ({ request }: Pick<ActionFunctionArgs, "request">) => firesio.devices().poll(request);
