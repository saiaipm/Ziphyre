"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { disconnectGoogle } from "./actions";

/** Kept in step with GOOGLE_SCOPES in src/lib/google/auth.ts. */
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/forms.body.readonly",
].join(" ");

export function ConnectGoogle({
  connectedEmail,
  needsReconnect,
}: {
  connectedEmail: string | null;
  needsReconnect: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    const supabase = createClient();

    // access_type=offline + prompt=consent is what makes Google return a
    // refresh token. Without both, a re-consent returns only an access
    // token and the connection silently can't outlive the hour.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?connect=google&next=/settings/connections`,
        scopes: SCOPES,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (error) {
      setBusy(false);
      toast.error("Couldn't start the connection", { description: error.message });
    }
  }

  async function onDisconnect() {
    setBusy(true);
    const result = await disconnectGoogle();
    setBusy(false);
    if (result.ok) {
      toast.success("Google account disconnected");
    } else {
      toast.error("Couldn't disconnect", { description: result.error });
    }
  }

  if (!connectedEmail) {
    return (
      <Button onClick={connect} disabled={busy}>
        {busy ? "Redirecting…" : "Connect Google account"}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Connected as <span className="font-medium">{connectedEmail}</span>
      </p>
      {needsReconnect && (
        <p className="text-sm text-fit-review">
          Ziphyre has lost access to your Google account. New applications
          aren&rsquo;t coming through. Existing candidates are unaffected.
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={connect} disabled={busy} variant={needsReconnect ? "default" : "outline"}>
          {needsReconnect ? "Reconnect" : "Use a different account"}
        </Button>
        <Button onClick={onDisconnect} disabled={busy} variant="ghost">
          Disconnect
        </Button>
      </div>
    </div>
  );
}
