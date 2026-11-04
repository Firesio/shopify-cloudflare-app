import { useState } from "react";
import { redirect, Form, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "~/internal/components/ui/alert";
import { Button } from "~/internal/components/ui/button";
import { Checkbox } from "~/internal/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "~/internal/components/ui/field";
import { Spinner } from "~/internal/components/ui/spinner";
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminUsers } from "~/wiring.server";
import { issueAuthorizationCode, validateAuthorizeRequest } from "~/services/mcp/oauth.server";
import { MCP_SCOPES, SCOPE_DESCRIPTIONS, type McpScope } from "~/domain/mcp/scopes";
import { INTERNAL_FONT_LINKS } from "~/internal/components";
import internalStyles from "~/styles/internal/internal.tailwind.css?url";

export const links: LinksFunction = () => [
  ...INTERNAL_FONT_LINKS,
  { rel: "stylesheet", href: internalStyles },
];

export const meta: MetaFunction = () => [
  { title: "Authorize MCP / AI Client" },
  { name: "robots", content: "noindex, nofollow" },
];

interface AuthorizeSuccessData {
  ok: true;
  client: { clientId: string; clientName: string };
  /** Ticked when the page opens: what the client asked for, within what it may be granted. */
  scopes: McpScope[];
  /** Every scope this client may be granted: the person decides which to tick. */
  choices: McpScope[];
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: string;
  user: { email: string };
}

interface AuthorizeErrorData {
  ok: false;
  error: string;
  description: string;
  user?: { email: string };
}

type LoaderData = AuthorizeSuccessData | AuthorizeErrorData;

export const loader = async ({ request }: LoaderFunctionArgs): Promise<LoaderData> => {
  const user = await requireAdminUser(request, { users: adminUsers() });
  const url = new URL(request.url);

  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const scope = url.searchParams.get("scope");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";

  if (!codeChallenge) {
    return {
      ok: false,
      error: "invalid_request",
      description: "PKCE code_challenge is required for MCP authorization.",
      user: { email: user.email },
    };
  }

  const validation = await validateAuthorizeRequest({
    clientId,
    redirectUri,
    responseType,
    scope,
  });

  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      description: validation.description,
      user: { email: user.email },
    };
  }

  return {
    ok: true,
    client: {
      clientId: validation.client.clientId,
      clientName: validation.client.clientName,
    },
    scopes: validation.scopes,
    choices: MCP_SCOPES.filter((scope) => validation.client.allowedScopes.includes(scope)),
    redirectUri: validation.redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod,
    user: { email: user.email },
  };
};

function refuse(description: string): Response {
  return new Response(description, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await requireAdminUser(request, { users: adminUsers() });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const state = form.get("state") ? String(form.get("state")) : null;
  const asked = form.getAll("scope").map(String).join(" ").trim();

  // The posted fields are only what the consent page echoed back: check them again against the stored client, so a forged post
  // can neither redirect to an unregistered URI nor widen the scopes beyond what the client was registered for.
  if (intent === "authorize" && asked === "") return refuse("invalid_scope: no permission was selected.");
  const checked = await validateAuthorizeRequest({
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    responseType: "code",
    scope: asked,
  });
  if (!checked.ok) return refuse(`${checked.error}: ${checked.description}`);

  const targetUrl = new URL(checked.redirectUri);
  if (intent === "deny") {
    targetUrl.searchParams.set("error", "access_denied");
    targetUrl.searchParams.set("error_description", "The user denied the authorization request.");
    if (state) targetUrl.searchParams.set("state", state);
    return redirect(targetUrl.toString());
  }
  if (intent !== "authorize") return redirect(targetUrl.toString());

  const code = await issueAuthorizationCode({
    clientId: checked.client.clientId,
    adminUserId: user.id,
    redirectUri: checked.redirectUri,
    scope: checked.scopes.join(" "),
    codeChallenge: String(form.get("code_challenge") ?? ""),
    codeChallengeMethod: String(form.get("code_challenge_method") ?? "S256"),
  });
  targetUrl.searchParams.set("code", code);
  if (state) targetUrl.searchParams.set("state", state);
  return redirect(targetUrl.toString());
};

function AuthorizeError({ data }: { data: AuthorizeErrorData }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <Card className="w-full max-w-md shadow-lg border-destructive/20">
        <CardHeader>
          <CardTitle className="text-destructive">Authorization Error</CardTitle>
          <CardDescription>The authorization request could not be processed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              <strong>{data.error}</strong>: {data.description}
            </AlertDescription>
          </Alert>
          <p className="text-xs text-muted-foreground">
            Please check your client configuration and redirect URI.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function ShieldIcon() {
  return (
    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
      <ShieldCheck className="size-6 text-primary" aria-hidden />
    </div>
  );
}

function ScopePicker({
  choices,
  picked,
  onPick,
}: {
  choices: McpScope[];
  picked: ReadonlySet<McpScope>;
  onPick: (next: ReadonlySet<McpScope>) => void;
}) {
  const all = picked.size === choices.length;
  const toggle = (scope: McpScope, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(scope);
    else next.delete(scope);
    onPick(next);
  };
  return (
    <FieldSet>
      <div className="flex items-center justify-between">
        <FieldLegend variant="label">Permissions / scopes</FieldLegend>
        <Button type="button" variant="ghost" size="sm" onClick={() => onPick(new Set(all ? [] : choices))}>
          {all ? "Clear all" : "Select all"}
        </Button>
      </div>
      <FieldGroup className="max-h-72 gap-3 overflow-y-auto rounded-md border p-3">
        {choices.map((scope) => {
          const desc = SCOPE_DESCRIPTIONS[scope];
          const id = `scope-${scope}`;
          return (
            <Field key={scope} orientation="horizontal">
              <Checkbox id={id} name="scope" value={scope} checked={picked.has(scope)} onCheckedChange={(on) => toggle(scope, on === true)} />
              <FieldContent>
                <FieldLabel htmlFor={id}>{desc?.label ?? scope}</FieldLabel>
                {desc?.description && <FieldDescription>{desc.description}</FieldDescription>}
              </FieldContent>
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}

function ConsentForm({ data, isSubmitting }: { data: AuthorizeSuccessData; isSubmitting: boolean }) {
  const [picked, setPicked] = useState<ReadonlySet<McpScope>>(() => new Set(data.scopes));
  return (
    <Form method="post" className="space-y-3 pt-2">
      <input type="hidden" name="client_id" value={data.client.clientId} />
      <input type="hidden" name="redirect_uri" value={data.redirectUri} />
      <ScopePicker choices={data.choices} picked={picked} onPick={setPicked} />
      {data.state && <input type="hidden" name="state" value={data.state} />}
      <input type="hidden" name="code_challenge" value={data.codeChallenge} />
      <input type="hidden" name="code_challenge_method" value={data.codeChallengeMethod} />

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="submit"
          name="intent"
          value="authorize"
          className="w-full sm:flex-1"
          disabled={isSubmitting || picked.size === 0}
        >
          {isSubmitting && <Spinner />}
          {isSubmitting ? "Authorizing..." : "Allow Access"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="deny"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </Form>
  );
}

export default function AuthorizePage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (!data.ok) return <AuthorizeError data={data} />;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <Card className="w-full max-w-lg shadow-xl border-border">
        <CardHeader className="text-center pb-2">
          <ShieldIcon />
          <CardTitle className="text-xl font-bold">Authorize AI / MCP Agent</CardTitle>
          <CardDescription className="text-sm">
            <strong>{data.client.clientName}</strong> is requesting permission to access the internal admin console.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Authorized account</span>
            <span className="font-medium text-foreground">{data.user.email}</span>
          </div>

          <ConsentForm data={data} isSubmitting={isSubmitting} />

          <p className="text-[11px] text-center text-muted-foreground">
            You can review or revoke agent access anytime in the Internal Admin under MCP & API.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
