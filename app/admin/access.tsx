import { createContext, useContext, type ReactNode } from "react";
import type { MemberPermission } from "~/domain/member-access";

/**
 * Asking what the person looking may do, from a page: `const { can } = useAccess(); can("app:manage")`. The one question a
 * page has about permissions, the way a route has `guardMember(request, "app:manage")` and the domain `can(member, ...)`.
 *
 * The layout says who is asking (`AccessProvider`, from what its loader read). A page outside it is asked nothing, and
 * answers no to everything: the default is to offer nothing. Hiding a control is only courtesy; the server is the lock and
 * asks again where the action runs.
 */
export interface Access {
  can(permission: MemberPermission): boolean;
}

export function makeAccess(permissions: readonly MemberPermission[]): Access {
  return { can: (permission) => permissions.includes(permission) };
}

const AccessContext = createContext<Access>(makeAccess([]));

export function AccessProvider({ permissions, children }: { readonly permissions: readonly MemberPermission[]; readonly children: ReactNode }) {
  return <AccessContext.Provider value={makeAccess(permissions)}>{children}</AccessContext.Provider>;
}

export function useAccess(): Access {
  return useContext(AccessContext);
}
