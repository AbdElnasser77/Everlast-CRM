"use client";

// Replaces the root layout when it (or a top-level provider) throws, so it must
// render its own <html>/<body> and can't rely on Tailwind being present.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "#f5f4f0",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", maxWidth: 360, margin: 0 }}>
            The app hit an unexpected error. Please reload the page.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "#3B694C",
              border: "none",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
