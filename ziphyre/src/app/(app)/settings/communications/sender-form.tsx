"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSender, saveBookingUrl } from "./actions";
import type { MailSettings } from "@/lib/mail/send";

/**
 * FR-113, FR-114, FR-116, FR-130.
 *
 * The copy carries more weight here than usual: **an app password is
 * the single most likely place a customer gets stuck**, because it is
 * not the thing anyone expects to be asked for. So the form says what
 * it is, says it needs 2-Step Verification, and links straight to the
 * page that issues one — rather than letting them paste their account
 * password and meet a bare SMTP 535.
 */
export function SenderForm({ settings }: { settings: MailSettings | null }) {
  const [fromEmail, setFromEmail] = useState(settings?.fromEmail ?? "");
  const [fromName, setFromName] = useState(settings?.fromName ?? "");
  const [appPassword, setAppPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [booking, setBooking] = useState(settings?.bookingUrl ?? "");
  const [savingBooking, setSavingBooking] = useState(false);

  async function onSaveSender() {
    setSaving(true);
    const result = await saveSender({ fromEmail, fromName, appPassword });
    setSaving(false);
    if (result.ok) {
      setAppPassword("");
      toast.success("Sending address verified and saved", {
        description: "Ziphyre signed in to Gmail successfully.",
      });
    } else {
      toast.error("Couldn't save", { description: result.error });
    }
  }

  async function onSaveBooking() {
    setSavingBooking(true);
    const result = await saveBookingUrl(booking);
    setSavingBooking(false);
    if (result.ok) toast.success("Booking link saved");
    else toast.error("Couldn't save", { description: result.error });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">Sending address</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Candidates see this as the sender, and their replies come back to
            it. Ziphyre never receives replies.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {settings?.verifiedAt && (
            <div className="flex items-start gap-3 rounded-lg border border-border bg-fit-strong-bg px-4 py-3">
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-fit-strong"
                aria-hidden
              />
              <p className="text-sm">
                Sending as{" "}
                <span className="font-medium">{settings.fromEmail}</span>
                {settings.passwordHint && (
                  <span className="text-muted-foreground">
                    {" "}
                    · app password ending {settings.passwordHint}
                  </span>
                )}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="from-email">Gmail address</Label>
              <Input
                id="from-email"
                type="email"
                autoComplete="off"
                placeholder="hiring@yourcompany.com"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from-name">Sender name</Label>
              <Input
                id="from-name"
                placeholder="Your company's name"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="app-password">App password</Label>
            <Input
              id="app-password"
              type="password"
              autoComplete="off"
              placeholder={
                settings?.verifiedAt
                  ? "Saved — paste a new one only to replace it"
                  : "16 characters from Google"
              }
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Not your Gmail password.
              </span>{" "}
              Google issues a separate 16-character app password, and only
              once 2-Step Verification is on.{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
              >
                Get one
                <ExternalLink className="size-3" aria-hidden />
              </a>
              . Spaces don&rsquo;t matter. It&rsquo;s stored encrypted and
              never shown again.
            </p>
          </div>

          <Button onClick={onSaveSender} disabled={saving || !fromEmail}>
            {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            {saving ? "Checking with Gmail…" : "Verify and save"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Ziphyre signs in to Gmail before saving, so a wrong password is
            caught here rather than by a candidate who never got an email.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-divider px-6 py-4">
          <h2 className="text-sm font-semibold">Interview booking link</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your own scheduling page — Google Calendar appointments,
            Calendly, Cal.com, anything. Interview invites include it.
          </p>
        </div>
        <div className="space-y-3 px-6 py-5">
          <Input
            aria-label="Booking link"
            placeholder="https://calendar.app.google/…"
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={onSaveBooking}
            disabled={savingBooking || !settings}
          >
            {savingBooking ? "Saving…" : "Save booking link"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Ziphyre carries this link and nothing more — it doesn&rsquo;t read
            your calendar, hold your availability, or know whether a slot was
            taken. That keeps it out of Google&rsquo;s permission review, which
            is what lets sign-in stay as simple as it is.
            {!settings && " Add a sending address first."}
          </p>
        </div>
      </section>
    </div>
  );
}
