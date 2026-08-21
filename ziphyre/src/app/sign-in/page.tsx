import type { Metadata } from "next";
import { SignInButton } from "./sign-in-button";
import { isConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  const ready = isConfigured();

  return (
    <div className="flex min-h-screen">
      {/* Left: the sign-in itself */}
      <div className="flex flex-1 items-center justify-center px-8 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-9">
            <span className="text-lg font-semibold tracking-tight">Ziphyre</span>
            <span className="mt-0.5 block text-xs tracking-wide text-muted-foreground">
              Screening Desk
            </span>
          </div>

          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use the Google account that owns your application forms.
          </p>

          <SignInButton disabled={!ready} />

          {!ready && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Sign-in activates once Supabase and Google credentials are
              configured.
            </p>
          )}

          <p className="mt-9 border-t border-divider pt-5 text-xs leading-relaxed text-muted-foreground">
            Ziphyre only ever reads your forms, responses and uploaded CVs. It
            has no permission to change them.
          </p>
        </div>
      </div>

      {/* Right: what this product is for */}
      <div className="hidden lg:flex flex-1 flex-col justify-center bg-sidebar px-14 py-16">
        <blockquote className="max-w-md">
          <p className="text-[22px] leading-snug font-medium text-white">
            Hiring stops being the thing that quietly eats a week.
          </p>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            Applications arrive, get read against the job description, and
            arrive in front of you already ordered — with the reasoning
            attached, so you can disagree with confidence.
          </p>
        </blockquote>

        <div className="mt-12 max-w-md border-t border-sidebar-border pt-6">
          <p className="label-meta mb-2 text-slate-500">The rule</p>
          <p className="text-sm leading-relaxed text-slate-300">
            Screening orders the pile. A person decides who moves forward —
            always, and without exception.
          </p>
        </div>
      </div>
    </div>
  );
}
