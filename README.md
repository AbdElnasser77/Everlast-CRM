# Everlast CRM

A real-time WhatsApp-based customer communication platform for Everlast Wellness. Agents manage inbound conversations, send messages and media, and handle customer inquiries from a unified inbox.

## Stack

- **Next.js 16.2.6** — App Router, `proxy.ts` auth guard
- **React 19** — client components, `startTransition`
- **Tailwind CSS v4**
- **Socket.IO** — real-time messaging and typing indicators
- **TypeScript**

## Features

- **Inbox** — live conversation list with unread counts, search, and filters
- **Chat** — text and media messaging (images, video, audio, documents)
- **Media preview** — WhatsApp-style file preview before sending; drag-and-drop support
- **Real-time** — socket-driven message delivery and typing indicators
- **Optimistic UI** — messages appear instantly, confirmed after API response
- **Admin panel** — team management, user roles, and audit log
- **Auth** — HttpOnly cookie JWT; role verified server-side on every session

## Getting Started

```bash
npm install
```

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SOCKET_URL=http://localhost:8000
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated requests are redirected to `/login` by the proxy guard.

## Project Structure

```
app/
  (auth)/login/        # Login page
  (dashboard)/
    layout.tsx         # Main sidebar (icon rail, admin nav, logout)
    chats/
      layout.tsx       # Conversation list sidebar
      [id]/page.tsx    # Chat view — messages, media, input
    dashboard/         # Admin analytics
    team/              # User management
    audit/             # Audit log
components/            # Shared UI (ConversationsContext)
hooks/                 # useConversations, useMessages
lib/                   # api.ts (fetch wrapper), socket.ts (singleton)
types/                 # Shared TypeScript types
proxy.ts               # Route auth guard
```

## Auth Flow

Login sets an HttpOnly JWT cookie (managed by the backend) and a plain `logged_in` cookie readable by `proxy.ts` for route protection. Role (`ADMIN` / `AGENT`) is always fetched from `GET /api/users/me` — never trusted from localStorage.
