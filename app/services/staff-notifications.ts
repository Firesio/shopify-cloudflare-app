/** Facade for the staff notification settings use cases (`app/services/staff-notifications/`). */
export { MAX_DEVICES_PER_ADMIN, type PushAvailability, type StaffNotificationDeps } from "~/services/staff-notifications/deps";
export { loadSettings, setPreference, type SetPreferenceInput } from "~/services/staff-notifications/settings";
export {
  registerDevice,
  removeDevice,
  sendTest,
  setDeviceEnabled,
  type RegisterDeviceError,
  type RegisterDeviceInput,
  type SendTestError,
} from "~/services/staff-notifications/devices";
export { sendTestPush, type TestPushDeps } from "~/services/staff-notifications/test-push";
