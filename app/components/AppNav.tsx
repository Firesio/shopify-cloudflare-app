/**
 * The embedded app's navigation menu. A link the person cannot open is not offered; each page checks the permission itself,
 * so hiding is only courtesy.
 */
export function AppNav({ permissions }: { readonly permissions: readonly string[] }) {
  const can = (permission: string) => permissions.includes(permission);
  return (
    <s-app-nav>
      <s-link href="/app" rel="home">Home</s-link>
      <s-link href="/app/support">Support</s-link>
      {can("billing:manage") ? <s-link href="/app/plans">Plan</s-link> : null}
      {can("members:manage") ? <s-link href="/app/members">Team</s-link> : null}
    </s-app-nav>
  );
}
