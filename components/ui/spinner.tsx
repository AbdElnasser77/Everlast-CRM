import { cn } from "@/lib/utils";

const SIZES = {
  xs: "w-3.5 h-3.5",
  sm: "w-4 h-4",
  md: "w-6 h-6",
  lg: "w-9 h-9",
} as const;

/**
 * The app's one spinner, in brand green. A faint full ring with a solid arc
 * travelling round it, so it still reads as "working" when it is tiny.
 *
 * Announced to screen readers through role="status" + a visually hidden label,
 * which is why the label defaults to something rather than nothing.
 */
export function Spinner({
  size = "md",
  label = "Loading",
  className,
}: {
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  return (
    <span role="status" className={cn("inline-flex shrink-0", className)}>
      <svg className={cn(SIZES[size], "animate-spin text-[#3B694C]")} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="3" className="opacity-20" />
        <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** A spinner centred in whatever space it is given — for a whole page or panel. */
export function PageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-1 min-h-full w-full flex-col items-center justify-center gap-3 py-16">
      <Spinner size="lg" label={label} />
      <p className="text-[13px] text-gray-400" aria-hidden>
        {label}…
      </p>
    </div>
  );
}
