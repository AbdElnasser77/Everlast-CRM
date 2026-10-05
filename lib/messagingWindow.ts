/**
 * WhatsApp's 24-hour customer-service window — the frontend's single copy of
 * the rule, matching the server's utils/messagingWindow.js.
 *
 * Free-form messages are allowed only within 24 hours of the customer's last
 * message. A conversation where the customer has NEVER written (started by a
 * campaign or by an agent) is outside the window too: only an approved template
 * can be sent there. Two copies of an older helper treated that case as open,
 * so the composer let agents type messages Meta then rejected.
 */
export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(lastCustomerMessageAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastCustomerMessageAt) return false;
  return now - new Date(lastCustomerMessageAt).getTime() < WINDOW_MS;
}

export function isWindowClosed(lastCustomerMessageAt: string | null | undefined, now = Date.now()): boolean {
  return !isWindowOpen(lastCustomerMessageAt, now);
}

/** Milliseconds left in the window, or 0 once closed / never opened. */
export function windowRemainingMs(lastCustomerMessageAt: string | null | undefined, now = Date.now()): number {
  if (!lastCustomerMessageAt) return 0;
  return Math.max(0, new Date(lastCustomerMessageAt).getTime() + WINDOW_MS - now);
}
