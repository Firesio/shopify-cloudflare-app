export interface WebhookDeliveryInput {
  readonly id: string;
  readonly eventId: string;
  readonly topic: string;
  readonly apiVersion: string;
  readonly shop: string;
  readonly triggeredAt: number;
  readonly receivedAt: number;
  readonly payloadHash: string;
}
