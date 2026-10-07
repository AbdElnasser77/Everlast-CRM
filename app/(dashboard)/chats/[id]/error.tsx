"use client";

// One chat failed to render: keep the chat list beside it so the agent can
// open another conversation.
import { ErrorPanel } from "@/components/ErrorPanel";

export default function ChatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel error={error} reset={reset} title="This chat couldn't be displayed" compact />;
}
