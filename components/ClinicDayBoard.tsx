"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { apiGetClinicDay } from "@/lib/api";

// The board is a complete HTML page built by n8n (Chart.js, its own styles and
// date picker). It renders in a sandboxed iframe WITHOUT allow-same-origin, so
// its scripts can't read the CRM's cookies, storage or DOM.
//
// Two things the page can't do from inside a srcdoc frame are bridged with
// postMessage by a script appended to it:
// - its "Go" button normally reloads its own URL with ?date=, which means
//   nothing in a srcdoc frame, so it reports the chosen date to us instead;
// - it reports its content height so the frame grows instead of scrolling.
const BRIDGE = `<script>
(function () {
  function send(msg) { msg.source = "clinic-day"; parent.postMessage(msg, "*"); }
  var go = document.getElementById("go");
  var day = document.getElementById("day");
  if (go && day) go.onclick = function () { if (day.value) send({ type: "date", date: day.value }); };
  function height() { send({ type: "height", height: document.documentElement.scrollHeight }); }
  if (window.ResizeObserver) new ResizeObserver(height).observe(document.body);
  window.addEventListener("load", height);
  height();
})();
</script>`;

function withBridge(html: string): string {
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i === -1 ? html + BRIDGE : html.slice(0, i) + BRIDGE + html.slice(i);
}

export default function ClinicDayBoard() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // undefined = let n8n pick its default day (today, Dubai).
  const [date, setDate] = useState<string | undefined>(undefined);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [height, setHeight] = useState(900);
  // Bumped by Refresh to refetch the same day.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGetClinicDay(date)
      .then((res) => {
        if (cancelled) return;
        setHtml(res.data.html);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the clinic dashboard");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, reloadKey]);

  const changeDate = useCallback((day: string | undefined) => {
    setLoading(true);
    setDate(day);
  }, []);

  const refresh = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data;
      if (!msg || msg.source !== "clinic-day") return;
      if (msg.type === "date" && typeof msg.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(msg.date)) {
        changeDate(msg.date);
      } else if (msg.type === "height" && typeof msg.height === "number") {
        setHeight(Math.max(600, Math.ceil(msg.height)));
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [changeDate]);

  const srcDoc = useMemo(() => (html ? withBridge(html) : undefined), [html]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">
          Appointments from Dok32{date ? ` for ${date}` : " for today"}
        </p>
        <div className="flex items-center gap-2">
          {date && (
            <button
              onClick={() => changeDate(undefined)}
              className="text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50"
            >
              Today
            </button>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
          <p className="text-[13px] text-red-600">{error}</p>
        </div>
      ) : !srcDoc ? (
        <div className="bg-white rounded-xl border border-gray-100 h-[600px] animate-pulse" />
      ) : (
        <iframe
          ref={frameRef}
          title="Clinic day board"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-popups"
          className={`w-full rounded-xl border border-gray-100 bg-white transition-opacity ${loading ? "opacity-60" : ""}`}
          style={{ height }}
        />
      )}
    </div>
  );
}
