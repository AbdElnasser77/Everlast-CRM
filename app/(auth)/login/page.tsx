"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiLogin } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiLogin(username, password);
      localStorage.setItem("user", JSON.stringify(res.user));
      document.cookie = "logged_in=1; path=/; SameSite=Lax; max-age=604800";
      router.push("/chats");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen font-[family-name:var(--font-geist-sans)]">
      {/* Left Panel */}
      <div className="relative hidden lg:flex w-[45%] flex-col justify-end p-10 bg-[#2d4f35] overflow-hidden">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute bottom-[-80px] right-[-80px] w-[520px] h-[520px] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute bottom-[40px] right-[40px] w-[340px] h-[340px] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute bottom-[140px] right-[140px] w-[180px] h-[180px] rounded-full border border-white/10" />

        {/* Logo */}
        <div className="flex items-center gap-3 z-10 mb-auto">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
            <Image
              src="/Brand.png"
              alt="Everlast Wellness"
              width={28}
              height={28}
              className="[filter:brightness(0)_saturate(100%)_invert(33%)_sepia(50%)_saturate(600%)_hue-rotate(110deg)_brightness(90%)]"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-white text-[15px]">
              <span className="font-light">Ever</span><span className="font-bold">last</span>
            </span>
            <span className="text-white/50 text-[11px] font-medium tracking-widest uppercase">CRM</span>
          </div>
        </div>

        {/* Middle content */}
        <div className="z-10 space-y-5 mb-15">
          <p className="text-white/50 text-[11px] tracking-[0.2em] uppercase font-medium ">
            Internal CRM
          </p>
          <h1 className="text-white font-bold text-[2.6rem] leading-[1.15] tracking-tight max-w-[500px]">
            Every client conversation, in one calm place.
          </h1>
          <p className="text-white/60 text-[15px] leading-relaxed max-w-[340px]">
            Messages, campaigns and bookings for the front desk team — synced in
            real time.
          </p>
        </div>

        {/* Footer */}
        <div className="z-10">
          <hr className="border-white/10 mb-5" />
        </div>
        <div className="z-10 flex justify-between items-center">
          <span className="text-white/40 text-[13px]">v0.4 · staging</span>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex flex-1 items-center justify-center bg-white px-8">
        <div className="w-full max-w-[420px] space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h2 className="text-[2rem] font-bold text-gray-900 tracking-tight">
              Welcome back
            </h2>
            <p className="text-gray-500 text-[15px]">
              Sign in with your team account to continue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-[14px] font-medium text-gray-700">
                Username
              </label>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 bg-white focus-within:ring-2 focus-within:ring-[#2d4f35]/20 focus-within:border-[#2d4f35]">
                <svg
                  className="w-4 h-4 text-gray-400 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 text-[15px] text-gray-800 outline-none placeholder:text-gray-400"
                  placeholder="username"
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[14px] font-medium text-gray-700">
                  Password
                </label>
              </div>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3 bg-white focus-within:ring-2 focus-within:ring-[#2d4f35]/20 focus-within:border-[#2d4f35]">
                <svg
                  className="w-4 h-4 text-gray-400 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 text-[15px] text-gray-800 outline-none"
                  placeholder="Password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-[14px] text-gray-500 hover:text-gray-700 transition-colors shrink-0 cursor-pointer"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label
              htmlFor="remember"
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                id="remember"
                type="checkbox"
                defaultChecked
                className="peer sr-only"
              />
              <span className="flex w-5 h-5 shrink-0 rounded-[5px] border-2 border-gray-300 bg-white items-center justify-center transition-colors peer-checked:bg-[#2d4f35] peer-checked:border-[#2d4f35]">
                <svg
                  className="w-3 h-3 text-white"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="2 6 5 9 10 3" />
                </svg>
              </span>
              <span className="text-[14px] text-gray-600 select-none">
                Keep me signed in on this device
              </span>
            </label>

            {/* Error message */}
            {error && (
              <p className="text-[13px] text-red-500 font-medium text-center">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2d4f35] hover:bg-[#243f2b] active:bg-[#1b3020] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[15px] py-3.5 rounded-xl transition-colors duration-150"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {/* Divider + Help */}
          <div className="space-y-5">
            <hr className="border-gray-100" />
            <p className="text-center text-[13px] text-gray-400">
              Trouble accessing? Ping{" "}
              <span className="font-semibold text-gray-600">#ops-help</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
