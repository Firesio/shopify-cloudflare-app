import { Badge } from "~/internal/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/internal/components/ui/table";
import { orderTeam, type SeatSummary, type TeamMember } from "~/domain/member-team";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";

/** The internal console is staff-only and English-only: no i18n here. */
const STATUS_LABEL = { invited: "Invited", pending: "Waiting", active: "Active", removed: "Removed" } as const;
const STATUS_VARIANT = { invited: "secondary", pending: "outline", active: "default", removed: "secondary" } as const;
const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member", viewer: "Viewer" } as const;

function seatLine(seats: SeatSummary): string {
  if (seats.kind === "unlimited") return "No seat limit";
  return `${seats.used} of ${seats.maximum} seats in use${seats.over > 0 ? `, ${seats.over} over the limit` : ""}`;
}

/**
 * Who from this shop can use the app, read-only, for answering a merchant who says "my colleague cannot get in". Staff do
 * not change a shop's team from here: the merchant's owners do, on the shop's own Team page.
 */
export function TeamCard({ team, seats }: { readonly team: readonly TeamMember[]; readonly seats: SeatSummary }) {
  const rows = orderTeam(team);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>People from this store who can use the app. Read only.</CardDescription>
        <CardAction>
          <Badge variant="outline">{seatLine(seats)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-6 text-sm text-muted-foreground">Nobody has opened the app for this shop yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="pl-6">
                    <div className="font-medium">{member.name ?? member.email ?? (member.linked ? "Unnamed" : "Invitation")}</div>
                    {member.name !== null && member.email !== null && <div className="text-sm text-muted-foreground">{member.email}</div>}
                  </TableCell>
                  <TableCell>
                    {ROLE_LABEL[member.role]}
                    {member.accountOwner && <span className="ml-2 text-xs text-muted-foreground">store owner</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[member.status]}>{STATUS_LABEL[member.status]}</Badge>
                  </TableCell>
                  <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">
                    {member.lastSeenAt === null ? "Never" : formatDateTime("en", member.lastSeenAt, UTC)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
