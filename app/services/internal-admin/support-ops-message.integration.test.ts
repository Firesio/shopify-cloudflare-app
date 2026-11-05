import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { testIds } from "~/test/fake-runtime";
import { SupportInboundRepo } from "~/models/support-inbound.server";
import { SupportRepo } from "~/models/support.server";
import { deleteStaffMessage, editStaffMessage, replyToTicket } from "./support-ops.server";

setupTestDatabase();
const run = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

async function openUnassignedThread(): Promise<string> {
  const opened = await new SupportInboundRepo(testIds).open({
    externalId: "hello@buyer.mail", source: "email", shop: null, shopName: "Jane",
    replyAddress: "jane@buyer.mail", senderName: "Jane", subject: "We need support to setup",
    body: "Hi repair team", category: "question", at: 1_000,
  });
  if (opened.status !== "written") throw new Error("expected written");
  return opened.value.ticketId;
}

describe("editing and deleting a staff message", () => {
  it("edits and deletes only staff messages, and the ticket's last author follows what is left", async () => {
    await run(async () => {
      const ticketId = await openUnassignedThread();
      const replied = await replyToTicket({ ticketId, staffName: "Khoi", body: "Draft." });
      if (!replied.ok) throw new Error("expected reply");
      const repo = new SupportRepo(testIds);
      const merchantId = (await repo.findForStaff(ticketId))?.messages.find((m) => m.author === "merchant")?.id ?? "";

      expect(await editStaffMessage(ticketId, replied.value.messageId, "Final.")).toBe(true);
      expect(await editStaffMessage(ticketId, merchantId, "Forged")).toBe(false);
      expect(await deleteStaffMessage(ticketId, merchantId)).toBe(false);

      expect(await deleteStaffMessage(ticketId, replied.value.messageId)).toBe(true);
      const thread = await repo.findForStaff(ticketId);
      expect(thread?.messages.map((m) => m.body)).toEqual(["Hi repair team"]);
      expect(thread?.ticket.lastAuthor).toBe("merchant");
    });
  });
});
