import { data } from "react-router";
import type { StaffAuditDependencies, StaffActor } from "~/services/staff-audit";
import { recordStaffEvent } from "~/services/staff-audit";
import {
  confirmMfaEnrollment,
  disableMfa,
  regenerateRecoveryCodes,
  startMfaEnrollment,
  type MfaFailure,
  type StaffMfaDependencies,
} from "~/services/staff-mfa";

export const MFA_INTENTS = ["mfa-start", "mfa-confirm", "mfa-disable", "mfa-regenerate"] as const;
export type MfaIntent = (typeof MFA_INTENTS)[number];

export function isMfaIntent(value: string): value is MfaIntent {
  return MFA_INTENTS.some((intent) => intent === value);
}

interface MfaIntentDeps {
  readonly mfa: StaffMfaDependencies;
  readonly audit: StaffAuditDependencies;
}

type Handler = (actor: StaffActor, form: FormData, deps: MfaIntentDeps) => Promise<ReturnType<typeof succeeded | typeof failed>>;

const succeeded = (
  value: { readonly mfa: "started" | "disabled" } | { readonly mfa: "enabled" | "regenerated"; readonly recoveryCodes: readonly string[] },
) => data(value);
const failed = (reason: MfaFailure) => data({ mfaError: reason }, { status: reason === "unavailable" ? 503 : 400 });

const codeFrom = (form: FormData) => String(form.get("code") ?? "").trim();

/** One handler per profile MFA intent; the profile action dispatches here. */
const HANDLERS: Readonly<Record<MfaIntent, Handler>> = {
  "mfa-start": async (actor, _form, deps) => {
    const started = await startMfaEnrollment(actor, deps.mfa);
    // The secret is not returned here: the loader shows the pending setup, so a reload keeps it on screen.
    return started.ok ? succeeded({ mfa: "started" }) : failed(started.reason);
  },
  "mfa-confirm": async (actor, form, deps) => {
    const confirmed = await confirmMfaEnrollment(actor.id, codeFrom(form), deps.mfa);
    if (!confirmed.ok) return failed(confirmed.reason);
    await recordStaffEvent("mfa_enabled", actor, deps.audit);
    return succeeded({ mfa: "enabled", recoveryCodes: confirmed.value.recoveryCodes });
  },
  "mfa-disable": async (actor, form, deps) => {
    const disabled = await disableMfa(actor.id, codeFrom(form), deps.mfa);
    if (!disabled.ok) return failed(disabled.reason);
    await recordStaffEvent("mfa_disabled", actor, deps.audit);
    return succeeded({ mfa: "disabled" });
  },
  "mfa-regenerate": async (actor, form, deps) => {
    const replaced = await regenerateRecoveryCodes(actor.id, codeFrom(form), deps.mfa);
    return replaced.ok ? succeeded({ mfa: "regenerated", recoveryCodes: replaced.value.recoveryCodes }) : failed(replaced.reason);
  },
};

export function handleProfileMfaIntent(intent: MfaIntent, actor: StaffActor, form: FormData, deps: MfaIntentDeps) {
  return HANDLERS[intent](actor, form, deps);
}
