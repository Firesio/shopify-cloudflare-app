import type { SupportCategory } from "~/support/categories";
import type { SupportAuthor, SupportThread, SupportTicket, SupportTicketSummary } from "~/support/types";

export type { SupportThread } from "~/support/types";

/** A staged upload ready to become an attachment. */
export interface StagedUpload {
  readonly id: string;
  readonly r2Key: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface SupportRepository {
  claimUploads(shop: string, ids: readonly string[], now: number): Promise<StagedUpload[]>;
  listRecentForShop(shop: string, limit: number): Promise<SupportTicketSummary[]>;
  attachMany(inputs: readonly { shop: string; messageId: string; id: string; r2Key: string; filename: string; contentType: string; sizeBytes: number; at: number }[]): Promise<void>;
  open(input: { shop: string; shopName: string; merchantEmail: string | null; ccEmails: readonly string[]; category: SupportCategory; subject: string; body: string; authorName: string; locale: string | null; at: number; ticketId?: string; uploads?: readonly StagedUpload[] }): Promise<{ id: string; messageId: string; created: boolean }>;
  openAsStaff(input: { shop: string; shopName: string; merchantEmail: string | null; ccEmails: readonly string[]; category: SupportCategory; subject: string; body: string; staffName: string; locale?: string | null; at: number }): Promise<{ id: string; messageId: string }>;
  reply(input: { shop: string; ticketId: string; author: SupportAuthor; authorName: string; body: string; at: number; messageId?: string; uploads?: readonly StagedUpload[] }): Promise<{ messageId: string; created: boolean } | undefined>;
  replyAsStaff(input: { ticketId: string; authorName: string; body: string; at: number }): Promise<{ shop: string | null; messageId: string } | undefined>;
  find(shop: string, ticketId: string): Promise<SupportThread | undefined>;
  findForStaff(ticketId: string): Promise<SupportThread | undefined>;
  listForShop(shop: string): Promise<SupportTicket[]>;
  listOpenForStaff(): Promise<SupportTicket[]>;
  closeAsStaff(ticketId: string, at: number): Promise<boolean>;
  setCcEmails(shop: string, ticketId: string, ccEmails: readonly string[]): Promise<boolean>;
  markRead(shop: string, ticketId: string, side: "merchant" | "staff", at: number): Promise<void>;
  markReadAsStaff(ticketId: string, at: number): Promise<void>;
}
