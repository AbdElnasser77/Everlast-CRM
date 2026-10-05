import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

let socket: Socket | null = null;

// Which WhatsApp number this client is watching. Sent on the handshake, because
// a browser cannot put a custom header on a websocket upgrade.
let currentNumberId: string | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Auth is carried by the httpOnly `token` cookie, sent on the handshake
    // because of `withCredentials`. The server rejects unauthenticated sockets.
    //
    // whatsappNumberId rides along in the auth payload so the server can put
    // this socket in the right number room AT HANDSHAKE, before a single event
    // can be delivered. The server re-validates it — it is a scoping hint, never
    // an authorization claim.
    socket = io(SOCKET_URL, {
      withCredentials: true,
      auth: { whatsappNumberId: currentNumberId },
      transports: ["websocket"],
      autoConnect: true,
    });
  }
  return socket;
}

/**
 * Re-room this client onto a different WhatsApp number.
 *
 * Reconnects the SAME Socket instance rather than tearing it down. That
 * distinction is the whole trick: every listener registered across the app is
 * bound to this object, so replacing it would orphan all of them (see the
 * warning on disconnectSocket). socket.io re-reads `socket.auth` on each
 * connect, so the new number is established during the handshake and there is
 * no window in which the previous number's events can still arrive.
 *
 * The reconnect also re-fires the `connect` handlers in useConversations and
 * useMessages, which already refetch — so the post-switch re-sync comes free
 * from machinery that is already there and already tested.
 */
export function setSocketNumber(id: string | null): void {
  currentNumberId = id;
  if (!socket) return; // not connected yet — getSocket() will pick it up

  socket.auth = { whatsappNumberId: id };
  if (socket.connected) socket.disconnect();
  socket.connect();
}

/**
 * Tear the socket down completely. LOGOUT ONLY.
 *
 * Do not call this to switch numbers. Nulling the module singleton means the
 * next getSocket() returns a DIFFERENT object, so every cleanup function still
 * holding the old one — in app/(dashboard)/layout.tsx, hooks/useConversations.ts,
 * hooks/useMessages.ts and app/(dashboard)/campaigns/page.tsx — would call
 * .off() on a dead socket and leak its listeners. Use setSocketNumber instead.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
