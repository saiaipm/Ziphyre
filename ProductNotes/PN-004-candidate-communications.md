# Product Note 004 — Candidate Communications

**Status:** Proposed, 28 August 2026
**Related:** ProductContext Principles 4, 5, 7, 9, 10 · Non-Goals 2, 5, 9,
10 · PN-002 (why Google integration was removed) · FR-87 – FR-100 ·
Tech spec §11 (retention)

---

## The ask

1. Send interview invites to a candidate from the dashboard.
2. A separate **Candidate Communications** surface, rather than cramming
   more into the pipeline.
3. The invite carries a link for the candidate to book an interview slot.
4. The candidate gets a link to track their application status.
5. Gmail SMTP is fine for the MVP.
6. The admin can customise the outreach templates.

This is the last unbuilt pillar. It is also the first feature that sends
something **irreversible to a real person**, which changes the standard of
care: a wrong score can be re-run, a sent email cannot be unsent.

---

## The ambiguity worth killing first

Point 3 says "link to Google Calendar to book a slot", and the note says
the idea is vague. It is the single decision that most changes the size of
this work, so it goes first.

There are three genuinely different things that phrase could mean.

### Option A — Ziphyre carries a booking link it does not own

The admin pastes their existing booking URL once — a Google Calendar
appointment schedule, Calendly, Cal.com, anything. Ziphyre drops it into
the invite email as a variable.

- **Integration:** none. No OAuth, no API, no tokens.
- **Ships:** immediately.
- **Costs:** Ziphyre does not know whether the candidate booked. Booking
  state lives in the admin's calendar tool, not in the pipeline.

### Option B — Ziphyre owns availability, without touching Google

The admin types available slots into Ziphyre. The candidate picks one on a
Ziphyre-hosted page. Ziphyre emails both parties and attaches an `.ics`,
which every calendar app on earth understands **with no integration at
all**.

- **Integration:** still none.
- **Ships:** a real build — slots, timezones, double-booking, reschedule,
  cancel.
- **Buys:** Ziphyre knows the interview is booked, so the pipeline can
  show it and Principle 7 holds (status as a byproduct of work).

### Option C — Real Google Calendar integration

OAuth into the admin's Google Calendar, read free/busy, write events.

**This is a trap, and the product has already paid to learn why.**
Calendar scopes are *sensitive* in exactly the way `drive.readonly`,
`spreadsheets.readonly` and `forms.body.readonly` were. PN-002 removed
Google intake specifically because sensitive scopes sit behind a Google
verification review — weeks, a privacy policy, a public homepage, a demo
video — during which the product is capped at hand-listed test users and
refresh tokens expire every seven days. That review is precisely the
go-to-market blocker M3.5 was built to escape.

Ziphyre's Google consent screen is currently *basic scopes only*, which is
why admin sign-in needs no review. **Adding a calendar scope would put the
entire product back behind the review queue** — not just scheduling. That
is not a scheduling decision; it is a company decision.

### Recommendation

**Option A now. Option B when there is evidence anyone needs it. Option C
only as a deliberate, written reversal of PN-002 — never by accident.**

Option A is also honest about what the product is: Non-Goal 5 already says
*"we schedule interviews and can carry a meeting link; we do not host the
meeting."* Carrying a booking link is exactly that sentence.

---

## What the constraints already decide

Four existing commitments settle questions before they are asked.

**Non-Goal 9 — "We do not show candidates their scores or internal notes.
Not as an option, not as a setting."** The status page (point 4) shows
*where they stand*, never a score, never a component rating, never an
assessment sentence. This also constrains templates: there can be no
`{{score}}` variable, because a template variable is a setting and this
Non-Goal explicitly refuses the setting.

**Non-Goal 10 — "Not a general communication tool... not building an inbox
or a chat product."** Outbound only. Replies carry `Reply-To:` the
admin's real address and land in their real inbox. Ziphyre never reads,
threads, or stores a reply.

**Principle 4 — "Silence is a bug."** This feature is the principle's
first real expression. But it argues for *making outcomes easy to send*,
not for sending them automatically — see the rejection question below.

**Principle 9 and tech spec §11 — retention.** A status-tracking URL is a
public surface pointing at candidate data. It has to die when the purge
runs, or the promise made on the apply page becomes false.

---

## Where communications actually happen

The ask is right that cramming this into the pipeline would hurt. But the
opposite mistake is worse: **the decision to contact someone is made while
looking at them**, and forcing a context-switch to another page to act on
it breaks Principle 5.

So the split is by *job*, not by object:

| Where | What happens there |
|---|---|
| **Pipeline** (existing) | *Send* — invite, outcome, custom note. Single or batch, from the row or the assessment dialog, using the selection that already exists |
| **Communications** (new page) | *Manage* — what was sent and to whom, what failed, template editing, sender setup, the booking link |

That keeps sending one action away from the decision, and puts everything
that is genuinely configuration on its own page where it belongs. The new
page is an **outbox and a settings surface**, not the primary send
surface.

Two things earn the page on their own: a failed send is invisible
otherwise, and templates need somewhere to live.

---

## The status page

A public URL per application — the same shape as the apply page, an
unguessable token, no login. The candidate sees a plain sentence about
where they are, the role, and when they applied.

**The internal stage vocabulary cannot be shown as-is.** "On hold" is an
internal category; telling a candidate they are on hold is worse than
telling them nothing. So the page maps stages onto candidate-facing
language:

| Internal | Candidate sees |
|---|---|
| New, Screened | Received — under review |
| Shortlisted | Shortlisted — the team will be in touch |
| On hold | Under review |
| Rejected | Not moving forward *(see below)* |

**The rejection question is the one real product decision here.** If the
page shows "not moving forward" the moment an admin marks Rejected, then
the product has told a candidate they were rejected before any person
chose to tell them — and it did so silently, on a page they might refresh
at any hour. That brushes against Principle 1's spirit and Non-Goal 2's.

The alternative: the page keeps saying "under review" until the admin
actually sends the outcome email, at which point it flips. That keeps a
person in the loop for the only message that hurts, and makes Principle
4's "silence is a bug" land where it should — as pressure on the admin to
send, not as an automatic notice.

**Recommendation:** rejection appears on the status page only after the
outcome has been sent.

---

## Email transport

Gmail SMTP is the right MVP call, with three things to say out loud.

**It is BYOK again, and the pattern already exists.** A Gmail address plus
an **app password** (not the account password; Gmail requires 2FA and an
app-specific password for SMTP). Stored exactly like provider keys —
encrypted with `SETTINGS_ENCRYPTION_KEY`, last four characters shown, never
returned to the browser.

**Sending is a job, not a request.** The queue, backoff and retry built in
M2 are exactly right for this, and an email that fails must be visible and
retryable rather than lost. A send that blocks the admin's click is also a
send that times out on a batch of twenty.

**Gmail's limits are real and low.** Roughly 500 recipients a day on a free
Gmail account, ~2,000 on Workspace. For an MSME shortlist that is ample;
it is not ample for a 500-candidate rejection sweep, and the product should
say so before the customer discovers it. This is the main reason the
transport is worth abstracting behind one interface now, so a real provider
can replace it later without touching templates or the outbox.

---

## Templates

Editable, unlike the screening prompt — and the difference is worth
stating, because PN-003 just refused the opposite. **A screening prompt
decides how a person is judged; a template decides how they are spoken to.**
Getting the wording wrong is embarrassing, not unfair. Customers also
genuinely need this: tone, language and signature vary per company in a way
screening criteria should not.

Three templates to start: **interview invite**, **outcome — not moving
forward**, and **a general update**. Variables limited to what is safe:
candidate name, role title, company name, booking link, status link.
Explicitly **no score, no assessment text, no internal notes** — Non-Goal 9.

Same mechanics as elsewhere in this codebase: preview with real values
before sending, one-click restore to default, and a saved template is a new
version rather than an overwrite.

---

## What it costs — honestly

- **A new public surface.** The status page is the product's second
  unauthenticated URL. It needs the same token discipline as the apply page
  and must be purged with everything else.
- **Irreversibility.** Everything else in this product can be undone. A sent
  email cannot. Batch sending needs a confirmation that names the number of
  real people about to be emailed.
- **Deliverability is now partly our problem.** Mail sent through a
  customer's Gmail may land in spam, and Ziphyre will be blamed. The outbox
  must show *sent*, not *delivered*, and never claim more than SMTP told us.
- **Support surface.** App passwords, 2FA, "why did it go to spam" — this
  is the first feature whose failures are mostly outside our code.

---

## What this is *not*

- Not an inbox. Replies go to the admin's real email (Non-Goal 10).
- Not automatic. No email sends without a person choosing to send it —
  Non-Goal 2 applies to communication as much as to outcomes.
- Not a calendar integration. See Option C.
- Not candidate-visible scoring, in any template, ever (Non-Goal 9).
- Not bulk marketing. Messaging exists to move *this* hiring process
  forward.

---

## Open decisions

**A. Scheduling model.** A (carry a booking link), B (Ziphyre owns slots),
or C (Google Calendar OAuth)?
*Recommendation: A.* C should not be chosen without explicitly reversing
PN-002, because it re-blocks the whole product, not just scheduling.

**B. Rejection on the status page.** Immediately on stage change, or only
after the outcome email is sent?
*Recommendation: after sending.* Keeps a person in the loop for the one
message that hurts.

**C. Where does the sender identity live?** One Gmail per organisation, or
per user?
*Recommendation: per organisation*, matching how provider keys already
work. Per user multiplies setup by every admin for no benefit at this size.

**D. Does the status link go out automatically with the existing
application confirmation?** FR-96 already sends nothing — the candidate
just sees a confirmation screen. Adding a "here's your link" email at
submission is the highest-value, lowest-risk use of this whole feature.
*Recommendation: yes*, and it may be worth building first.

---

## Next steps

1. Decide A–D — **A materially changes the tech spec**, so it should be
   settled before that document is written.
2. Functional spec gains FR-106 onward for sending, the status page,
   templates and the outbox.
3. Tech spec gains the transport interface, the `send_email` job kind,
   `message` and `message_template` tables, the status token, and the
   retention rule that kills it.
