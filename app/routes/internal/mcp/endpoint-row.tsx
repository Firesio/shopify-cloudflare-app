import { Check, Copy } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "~/internal/components/ui/input-group";

/** A read-only, selectable value with a copy button inside the field. */
export function EndpointRow({
  label,
  text,
  onCopy,
  copied,
}: {
  label: string;
  text: string;
  onCopy: (t: string) => void;
  copied: boolean;
}) {
  return (
    <InputGroup>
      <InputGroupInput readOnly value={text} aria-label={label} className="font-mono text-xs" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label={`Copy ${label}`}
          size="icon-xs"
          onClick={() => onCopy(text)}
        >
          {copied ? <Check className="text-emerald-600" /> : <Copy />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
