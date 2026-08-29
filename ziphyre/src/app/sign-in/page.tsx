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
              AI Powered Screening Desk
            </span>
          </div>

          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in with your Google account.
          </p>

          <SignInButton disabled={!ready} />

          {!ready && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Sign-in activates once Supabase and Google credentials are
              configured.
            </p>
          )}

          {/* The line that stood here — "Ziphyre only ever reads your
              forms, responses and uploaded CVs. It has no permission to
              change them." — was written for the Google intake path and
              was left behind when PN-002 removed it in M3.5. By then it
              had become false: Ziphyre stores CVs in its own bucket and
              holds the only copy of every one it receives, which is
              exactly why §11's purge is load-bearing. A promise the
              product cannot keep is worse on a sign-in screen than no
              promise at all, so there is nothing here now. */}
        </div>
      </div>

      {/* Right: what this product is for.
          Four steps read at a glance where a paragraph did not get read
          at all. The chain is laid out as steps rather than run together
          on one line so the eye can take the shape in without reading
          the words — which is the only way a panel like this earns its
          space. */}
      <div className="hidden lg:flex flex-1 flex-col justify-center bg-sidebar px-14 py-16">
        <div className="max-w-md">
          <p className="text-[34px] leading-tight font-semibold tracking-tight text-white">
            Hire in a Flash!
          </p>

          <ol className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-2 text-base font-medium text-slate-200">
            {["AI Screen", "Shortlist", "Interview"].map((step) => (
              <li key={step} className="flex items-center gap-2">
                {step}
                <span aria-hidden className="text-slate-600">
                  &rarr;
                </span>
              </li>
            ))}
            <li className="text-white">Hire! 🔥</li>
          </ol>

          <p className="mt-5 text-lg text-slate-400">Effortlessly 🚀</p>
        </div>

        {/* Kept, but cut to one line. Principle 1 is the product's whole
            posture on automated hiring, and dropping it from the only
            screen every admin sees would quietly drop the claim. */}
        <div className="mt-12 max-w-md border-t border-sidebar-border pt-6">
          <p className="text-sm text-slate-400">
            Screening ranks. <span className="text-slate-200">You decide.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
