import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[#f5f4f0] px-6 text-center">
      <p className="text-[44px] font-bold text-[#3B694C] leading-none">404</p>
      <div className="space-y-1.5">
        <h1 className="text-[18px] font-bold text-gray-900">Page not found</h1>
        <p className="text-[13px] text-gray-500 max-w-sm">
          The page you’re looking for doesn’t exist or may have moved.
        </p>
      </div>
      <Link
        href="/chats"
        className="px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#3B694C] hover:bg-[#2f5540] transition-colors"
      >
        Back to Inbox
      </Link>
    </div>
  );
}
