"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { userLandingPage } from "@/lib/page-access";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  Flame,
  Loader2,
  Lock,
  LogIn,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      toast.error("Enter your username and password.");
      return;
    }

    setIsLoading(true);
    const result = await signIn("credentials", {
      identifier: trimmedUsername,
      username: trimmedUsername,
      password,
      redirect: false,
    });
    setIsLoading(false);

    if (result?.error) {
      toast.error("Invalid username or password.");
      return;
    }

    const session = await getSession();
    if (!session?.user?.id) { toast.error("Unable to load your access. Please try again."); return; }
    toast.success("Login successful.");
    router.replace(userLandingPage(session.user.permissions, session.user.role === "ADMIN" || session.user.roleName === "ADMIN", new URLSearchParams(window.location.search).get("callbackUrl")));
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f1f4f7] px-4 py-8 text-slate-950">
      <section className="w-full max-w-[430px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl shadow-slate-950/10">
        <div className="h-1 bg-gradient-to-r from-blue-600 via-teal-500 to-emerald-500" />

        <div className="p-6 sm:p-9">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-950">ISAY Fried Chicken</p>
              <p className="text-xs font-medium text-slate-500">Business Operations</p>
            </div>
          </div>

          <div className="mb-7">
            <h1 className="text-2xl font-black tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter your account details to continue.
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username" className="font-bold text-slate-700">
                Username or email
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Username or email"
                  autoComplete="username"
                  autoFocus
                  className="h-12 rounded-xl border-slate-300 bg-white pl-10 text-base shadow-sm shadow-slate-950/[0.03]"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="font-bold text-slate-700">
                Password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="h-12 rounded-xl border-slate-300 bg-white pl-10 pr-11 text-base shadow-sm shadow-slate-950/[0.03]"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              disabled={isLoading}
              type="submit"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in
                </>
              )}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
