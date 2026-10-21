export default function ChatsPage() {
  return (
    <div className="flex flex-1 h-full items-center justify-center bg-canvas-warm">
      <div className="flex flex-col items-center gap-5 text-center max-w-sm px-6">
        {/* Icon */}
        <div className="w-[72px] h-[72px] rounded-2xl bg-brand-200 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-brand-fg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15.5 12" />
          </svg>
        </div>

        {/* Text */}
        <div className="space-y-2.5">
          <h2 className="text-[20px] font-bold text-gray-900 tracking-tight">
            Select a conversation
          </h2>
          <p className="text-[14px] text-gray-500 leading-relaxed">
            Messages from clients land in your inbox in real-time.
          </p>
        </div>
      </div>
    </div>
  );
}
