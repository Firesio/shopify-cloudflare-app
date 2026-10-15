import { buildMatrix } from "~/domain/staff-notification-topics";
import type { DeviceView, NotificationSettingsView } from "~/domain/staff-notification-view";

export function deviceView(overrides: Partial<DeviceView> = {}): DeviceView {
  return {
    id: "dev-1",
    label: "Chrome on Linux",
    kind: "desktop",
    enabled: true,
    createdAt: 1_700_000_000_000,
    lastUsedAt: null,
    endpointHash: "0".repeat(64),
    ...overrides,
  };
}

/** What the settings loader returns: every topic at its default, push configured, no devices. */
export function settingsView(overrides: Partial<NotificationSettingsView> = {}): NotificationSettingsView {
  return {
    matrix: buildMatrix([]),
    devices: [],
    push: { configured: true, publicKey: "BCV0mQ8T3W1u2ZL0V3o5vBq8rQ6J4mTqkq2d0o9y8vXwYQ", maxDevices: 5 },
    ...overrides,
  };
}
