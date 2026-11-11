import { aiRepository } from "~/wiring.server";
import { useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "AI Analytics · Staff Console" },
];
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/internal/components/ui/card";
import { Skeleton } from "~/internal/components/ui/skeleton";
import { Coins, Gauge } from "lucide-react";
import { requireOwner } from "~/services/admin-auth.server";
import { adminUsers } from "~/wiring.server";
import { MODEL_ROLES } from "~/ai/roles";
import { useActionToast } from "~/internal/use-action-toast";
import { formatNumber } from "~/i18n/format";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import { Deferred, StatRowSkeleton } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { AI_INTENT_HANDLERS, readAiIntent, type IntentOutcome } from "./ai/intents.server";
import { PurposeCard } from "./ai/purpose-card";
import { buildPurpose, summarizeRun } from "./ai/purposes";
import { RecentCallsTable } from "./ai/recent-calls-table";

/** The internal console is staff-only and English-only — no i18n here. */
const LANGUAGE: LanguageCode = "en";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function loadAiOverview() {
  const repo = aiRepository();
  const now = Date.now();

  const [rows, spend, runs] = await Promise.all([
    repo.allModels(),
    repo.tokensSince(now - THIRTY_DAYS_MS),
    repo.recentRuns(15),
  ]);

  return {
    purposes: MODEL_ROLES.map((role) => buildPurpose(role, rows, now)),
    spend,
    runs: runs.map(summarizeRun),
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Owner-only: changing a chain changes what every merchant is answered with,
  // and what we are billed. This is the ONLY thing awaited, so a non-owner still
  // gets the 403 before anything is rendered or any data query starts.
  await requireOwner(request, { users: adminUsers() });

  return { overview: streamRegion("ai", "overview", loadAiOverview()) };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<IntentOutcome> => {
  const actor = await requireOwner(request, { users: adminUsers() });
  const form = await request.formData();

  const intent = readAiIntent(String(form.get("intent") ?? ""));
  if (intent === null) return { error: "Unknown action." };

  return AI_INTENT_HANDLERS[intent](
    { role: String(form.get("role") ?? ""), modelId: String(form.get("modelId") ?? "") },
    { repo: aiRepository(), actor: actor.email, at: Date.now() },
  );
};

export default function AiSettings() {
  const { overview } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  useActionToast(actionData, {
    error: actionData && "error" in actionData ? actionData.error : undefined,
    success: actionData && "success" in actionData ? actionData.success : undefined,
  });

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <Deferred resolve={overview} fallback={<AiSkeleton />} errorTitle="AI settings">
        {({ purposes, spend, runs }) => (
          <>
            <div className="flex flex-col gap-4 px-4 lg:px-6">
              <UsageStats spend={spend} />
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {purposes.map((purpose) => (
                  <PurposeCard key={purpose.role} purpose={purpose} busy={busy} />
                ))}
              </div>
            </div>
            <RecentCallsTable runs={runs} />
          </>
        )}
      </Deferred>
    </div>
  );
}

/** A card-shaped placeholder: a title line, then `lines` body rows. */
function CardPlaceholder({ lines }: { lines: number }) {
  return (
    <Card aria-hidden>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Mirrors the page: three usage tiles, one card per purpose, recent calls. */
function AiSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <StatRowSkeleton count={3} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {MODEL_ROLES.map((role) => (
          <CardPlaceholder key={role} lines={3} />
        ))}
      </div>
      <CardPlaceholder lines={5} />
    </div>
  );
}

function UsageStats({
  spend,
}: {
  spend: { calls: number; input: number; output: number };
}) {
  const tiles = [
    { label: "Calls (30 days)", value: spend.calls, icon: Gauge },
    { label: "Input tokens", value: spend.input, icon: Coins },
    { label: "Output tokens", value: spend.output, icon: Coins },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-3">
      {tiles.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardHeader>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {formatNumber(LANGUAGE, value)}
            </CardTitle>
            <CardAction>
              <Icon className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
