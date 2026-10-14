import { data } from "react-router";
import { authClientKey } from "~/lib/auth-client-key";
import { safeRedirectPath } from "~/services/admin-auth.server";
import type { AuthAttemptLimiter } from "~/ports/auth-rate-limit";
import type { LoginResult } from "~/services/admin-auth.server";

type LoginActionDeps = {
  limiter: AuthAttemptLimiter;
  verifyCredentials: (email: string, password: string) => Promise<LoginResult>;
  createSession: (userId: string, redirectTo: string) => Promise<Response>;
  productionLike: boolean;
};

export async function handleLoginAction(request: Request, deps: LoginActionDeps) {
  const limit = await deps.limiter.check(authClientKey(request));
  if (limit === "limited") return data({ error: "rateLimited" as const }, { status: 429 });
  if (limit === "unavailable" && deps.productionLike) {
    return data({ error: "serviceUnavailable" as const }, { status: 503 });
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safeRedirectPath(form.get("next"));

  if (!email || !password) {
    return data({ error: "missingFields" as const }, { status: 400 });
  }

  // A failure here is ours, not the user's: it is logged and shown as a message on
  // the sign-in form, never as the generic error page.
  try {
    const result = await deps.verifyCredentials(email, password);
    if (!result.ok) return data({ error: result.reason }, { status: 401 });

    return await deps.createSession(result.user.id, next);
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin_login.failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return data({ error: "unexpected" as const }, { status: 500 });
  }
}
