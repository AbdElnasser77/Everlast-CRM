import { Lock } from "lucide-react";

/**
 * Shown when the signed-in user's role doesn't include the permission a page
 * needs. The sidebar already hides those pages, so this is mostly reached by a
 * bookmark or a pasted link — it says so plainly instead of showing a broken,
 * half-loaded screen full of failed requests.
 */
export function NoAccess({ what = "this page" }: { what?: string }) {
  return (
    <div className="flex flex-1 min-h-full flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
        <Lock className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-[15px] font-semibold text-gray-800">You don&apos;t have access to {what}</p>
      <p className="text-[13px] text-gray-400 max-w-sm">
        Your role doesn&apos;t include it. If you need it, ask an admin to change your role on the Team page.
      </p>
    </div>
  );
}
