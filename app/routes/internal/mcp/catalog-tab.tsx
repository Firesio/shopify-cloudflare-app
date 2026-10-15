import { Badge } from "~/internal/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/internal/components/ui/card";
import type { TOOL_CATALOG } from "~/mcp/catalog";

type CatalogTool = (typeof TOOL_CATALOG)[number]["tools"][number];

function ToolCard({ tool }: { tool: CatalogTool }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader>
        <CardTitle className="font-mono text-sm">{tool.name}</CardTitle>
        <CardDescription className="text-xs">{tool.summary}</CardDescription>
        <CardAction>
          <Badge variant={tool.isMutation ? "secondary" : "outline"}>
            {tool.isMutation ? "Mutation" : "Read-only"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        Scope: <code className="rounded bg-muted px-1 py-0.5">{tool.scope}</code>
      </CardContent>
    </Card>
  );
}

export function CatalogTab({
  catalog,
}: {
  catalog: typeof TOOL_CATALOG;
  appUrl: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      {catalog.map((group) => (
        <section key={group.domain} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {group.domain}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.tools.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
