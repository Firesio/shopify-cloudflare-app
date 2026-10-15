import { Bot, Check, Copy, Shield, Terminal } from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/internal/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "~/internal/components/ui/field";
import { EndpointRow } from "./endpoint-row";

type CopyProps = {
  appUrl: string;
  onCopy: (t: string) => void;
  copiedText: string | null;
};

function agentConfig(serverName: string, appUrl: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [serverName]: {
          url: `${appUrl}/api/mcp`,
          headers: {
            Authorization: "Bearer <YOUR_PAT_TOKEN>",
          },
        },
      },
    },
    null,
    2,
  );
}

function EndpointField({
  label,
  text,
  onCopy,
  copiedText,
}: {
  label: string;
  text: string;
  onCopy: (t: string) => void;
  copiedText: string | null;
}) {
  return (
    <Field>
      <FieldLabel className="text-xs font-semibold text-muted-foreground uppercase">{label}</FieldLabel>
      <EndpointRow label={label} text={text} onCopy={onCopy} copied={copiedText === text} />
    </Field>
  );
}

function OAuthCard({ appUrl, onCopy, copiedText }: CopyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Zero-Touch OAuth 2.0</CardTitle>
        <CardAction>
          <Shield className="size-5 text-muted-foreground" />
        </CardAction>
        <CardDescription>
          Seamless agent discovery via RFC 8414 & RFC 9728. Point compatible agents directly to this domain.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          Agents supporting standard OAuth discovery can automatically register and connect without manual token copy-pasting.
        </p>
        <FieldGroup className="gap-4">
          <EndpointField
            label="MCP RPC Endpoint"
            text={`${appUrl}/api/mcp`}
            onCopy={onCopy}
            copiedText={copiedText}
          />
          <EndpointField
            label="OAuth Resource Discovery (RFC 9728)"
            text={`${appUrl}/.well-known/oauth-protected-resource`}
            onCopy={onCopy}
            copiedText={copiedText}
          />
          <EndpointField
            label="Authorization Server Metadata (RFC 8414)"
            text={`${appUrl}/.well-known/oauth-authorization-server`}
            onCopy={onCopy}
            copiedText={copiedText}
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function RestApiCard({ appUrl, onCopy, copiedText }: CopyProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>REST API Base URL</CardTitle>
        <CardAction>
          <Terminal className="size-5 text-muted-foreground" />
        </CardAction>
        <CardDescription>
          Reusable HTTP endpoints for external dashboards, CI/CD, and scripts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          All MCP tools are also reachable as standard JSON REST endpoints at <code>/api/v1/*</code> using standard Bearer authentication.
        </p>
        <FieldGroup className="gap-4">
          <EndpointField
            label="REST API Root"
            text={`${appUrl}/api/v1/health`}
            onCopy={onCopy}
            copiedText={copiedText}
          />
          <Field>
            <FieldLabel className="text-xs font-semibold text-muted-foreground uppercase">
              cURL Example
            </FieldLabel>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {`curl -H "Authorization: Bearer <TOKEN>" \\
  ${appUrl}/api/v1/metrics/revenue`}
            </pre>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ConfigSnippet({
  label,
  config,
  onCopy,
  copiedText,
}: {
  label: string;
  config: string;
  onCopy: (t: string) => void;
  copiedText: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">{label}</span>
        <Button size="xs" variant="ghost" onClick={() => onCopy(config)}>
          {copiedText === config ? <Check className="text-emerald-600" /> : <Copy />}
          {copiedText === config ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{config}</pre>
    </div>
  );
}

function AgentSnippetsCard({ appUrl, onCopy, copiedText }: CopyProps) {
  const claudeConfig = agentConfig("shopify-app-ops", appUrl);
  const cursorConfig = agentConfig("shopify-ops", appUrl);

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle>AI Agent Configuration Snippets</CardTitle>
        <CardAction>
          <Bot className="size-5 text-muted-foreground" />
        </CardAction>
        <CardDescription>
          Paste into your AI coding tool's configuration to enable store monitoring and support management.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ConfigSnippet
          label="Claude Desktop (`claude_desktop_config.json`)"
          config={claudeConfig}
          onCopy={onCopy}
          copiedText={copiedText}
        />
        <ConfigSnippet
          label="Cursor (`.cursor/mcp.json`)"
          config={cursorConfig}
          onCopy={onCopy}
          copiedText={copiedText}
        />
      </CardContent>
    </Card>
  );
}

export function QuickConnectTab(props: CopyProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <OAuthCard {...props} />
      <RestApiCard {...props} />
      <AgentSnippetsCard {...props} />
    </div>
  );
}
