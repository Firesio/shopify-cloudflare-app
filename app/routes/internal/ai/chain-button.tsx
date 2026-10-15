import { Form, useNavigation } from "react-router";
import { Button } from "~/internal/components/ui/button";
import { Spinner } from "~/internal/components/ui/spinner";

type ChainIntent = "up" | "down" | "remove" | "enable" | "disable" | "add" | "recommend";

/**
 * True while THIS purpose's submission of `intent` (for `modelId`, when the
 * intent targets one) is in flight — so only the pressed control shows a
 * spinner, never every button on the page.
 */
export function useIsPending(role: string, intent: ChainIntent, modelId?: string): boolean {
  const { state, formData } = useNavigation();
  if (state === "idle" || !formData) return false;
  return (
    formData.get("role") === role &&
    formData.get("intent") === intent &&
    (modelId === undefined || formData.get("modelId") === modelId)
  );
}

/** One icon button that posts a single chain intent. */
export function ChainButton({
  role,
  modelId,
  intent,
  label,
  busy,
  disabled,
  children,
}: {
  role: string;
  modelId: string;
  intent: "up" | "down" | "remove" | "enable" | "disable";
  /** Accessible name — the button is icon-only. */
  label: string;
  busy: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const pending = useIsPending(role, intent, modelId);
  return (
    <Form method="post">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="modelId" value={modelId} />
      <input type="hidden" name="intent" value={intent} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        title={label}
        disabled={busy || disabled}
      >
        {pending ? <Spinner /> : children}
      </Button>
    </Form>
  );
}
