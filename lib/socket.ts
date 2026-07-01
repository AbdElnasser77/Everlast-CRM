import { io, Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL!;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Auth is carried by the httpOnly `token` cookie, sent on the handshake
    // because of `withCredentials`. The server rejects unauthenticated sockets.
    socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ["websocket"],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
