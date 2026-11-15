import { recordSends, type RecordedSends } from "@firesio/app/preset/testing";
import { afterEach } from "vitest";

/**
 * Call once at the top of a test file, like `setupTestDatabase()`. Returns `record(queue)`: the library's `recordSends`, whose
 * replacement of the real producer binding (shared by every file in this runtime) is put back after each test.
 */
export function setupSendRecording(): (queue: Queue) => RecordedSends {
  const recorded: RecordedSends[] = [];
  afterEach(() => recorded.splice(0).forEach((sends) => sends.restore()));
  return (queue) => {
    const sends = recordSends(queue);
    recorded.push(sends);
    return sends;
  };
}
