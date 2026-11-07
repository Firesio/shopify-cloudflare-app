import type { AccessSubmission } from "~/domain/member-access-draft";

/**
 * What the page's Save sends, as the form's own fields: the intent the draft means, the member, the role and, for a set of
 * their own, one field per permission. None while nothing changed, so a form submitted by anything else sends nothing about access.
 */
export function AccessFields({ memberId, submission }: { readonly memberId: string; readonly submission: AccessSubmission | undefined }) {
  if (submission === undefined) return null;
  return (
    <>
      <input type="hidden" name="intent" value={submission.intent} />
      <input type="hidden" name="id" value={memberId} />
      <input type="hidden" name="role" value={submission.role} />
      {submission.intent === "setPermissions" && submission.permissions.map((permission) => <input key={permission} type="hidden" name="permissions" value={permission} />)}
    </>
  );
}
