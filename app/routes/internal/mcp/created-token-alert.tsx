import { Check, Copy, KeyRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "~/internal/components/ui/alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/internal/components/ui/input-group";

/**
 * Shown once, inline (so it survives without JavaScript): the raw token is
 * never stored and cannot be displayed again.
 */
export function CreatedTokenAlert({
  createdToken,
  tokenLabel,
  copiedText,
  onCopy,
}: {
  createdToken: string;
  tokenLabel: string;
  copiedText: string | null;
  onCopy: (text: string) => void;
}) {
  return (
    <Alert>
      <KeyRound />
      <AlertTitle className="line-clamp-none">Personal access token created: {tokenLabel}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>Copy this token now. For security, it will never be displayed again.</p>
        <InputGroup>
          <InputGroupInput
            readOnly
            value={createdToken}
            aria-label="Personal access token"
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="sm" onClick={() => onCopy(createdToken)}>
              {copiedText === createdToken ? (
                <>
                  <Check className="text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy />
                  Copy
                </>
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </AlertDescription>
    </Alert>
  );
}
