"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignInButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();

    // M0 requests sign-in only. The Drive / Sheets / Forms scopes are
    // requested at M3, when connecting a form — asking for them now would
    // show an alarming consent screen for permissions nothing uses yet.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (error) {
      setLoading(false);
      toast.error("Couldn't start sign-in", { description: error.message });
    }
  }

  return (
    <Button
      className="mt-7 w-full"
      size="lg"
      onClick={signIn}
      disabled={disabled || loading}
    >
      {loading ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}
