import { reconcileShop, type ShopReconciler } from "./reconcile-shop";

export type UninstallReconciliationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly detail: string };

export type UninstallReconciliationDependencies = ShopReconciler;

/**
 * Performs both Shopify reads and reports the outcome; it never retries. `recordUninstall` logs a failure
 * (`shopify.uninstall.reconciliation_failed`) and still reports the uninstall as recorded, because a failure here is
 * not always transient (a missing Partner credential or a redacted shop never succeeds on retry) and a retry of the
 * whole delivery would dead-letter an uninstall whose real work is done. The daily Partner-history sweep is what
 * catches the ledger up.
 */
export async function reconcileAfterUninstall(
  dependencies: UninstallReconciliationDependencies,
): Promise<UninstallReconciliationResult> {
  const result = await reconcileShop(dependencies);
  if (result.status === "failed") return { ok: false, code: result.code, detail: result.detail };
  return { ok: true };
}
