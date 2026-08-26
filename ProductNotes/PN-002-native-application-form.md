# Product Note 002 — Ziphyre's Own Application Form

**Status:** Ready for Functional Spec — four open questions resolved 23 August 2026
**Date:** 23 August 2026
**Reads with:** `ProductContext.md`, `PN-001`, and the shipped M3 Google integration
**Pillars touched:** Roles & Application Intake

---

## The ask, in one line

Replace the Google Form setup ritual with a link: the admin creates a posting, Ziphyre gives them an application link, and candidates apply on a page we host — no template copying, no dropdown string matching, no OAuth, no sheet.

---

## Why this, why now

**Our own principles already say the current flow is wrong.**

> *Principle 6 — Usable on day one, without training. No implementation projects, no configuration marathons, no manuals.*

We shipped a 144-line manual (`docs/google-form-setup.md`). That is the tell. To receive a single application today, an admin must: copy a template, recreate ten questions with exact types and validation, set "Collect email addresses" to *Verified*, link a response sheet, return to Ziphyre, connect Google through OAuth, pick the form from a list, and get every dropdown string byte-identical to their opening titles. Principle 5 says a common task taking more than a couple of actions "is a problem worth a spec." This is that spec.

**This was already the plan.** The functional spec's Later Versions table lists, as the very next theme: *"Ziphyre generates the form directly, removing template-copying and dropdown sync entirely."* PN-002 is that line — with one ambiguity resolved below.

**And there is a harder commercial reason.** Ziphyre currently cannot onboard a real customer at all. The three scopes M3 depends on — `drive.readonly`, `spreadsheets.readonly`, `forms.body.readonly` — are *sensitive*, and Google requires a verification review before anyone outside a hand-maintained test-user list can connect. Until that review passes, we are capped at test users and our refresh tokens expire every seven days. Verification wants a privacy policy, a public homepage, and a demo video, and takes weeks. **Every day the product's only intake path runs through those scopes, our go-to-market sits behind Google's review queue.** A form we host removes that dependency from the critical path rather than waiting it out.

---

## The ambiguity worth killing first

"Ziphyre generates the form directly" can mean two very different things.

**(A) Ziphyre creates a *Google* Form via the Forms API.** Rejected. It requires the `forms.body` **write** scope, which breaks a rule we deliberately made structural in TechDecisions §5.1: *"No write scope is ever requested. FR-63 becomes impossible to violate rather than merely forbidden."* It also makes the verification problem worse, not better, and still leaves us polling a sheet and matching column headers. It removes the copy-paste step and nothing else.

**(B) Ziphyre hosts the form itself.** This note proposes (B).

---

## What the candidate sees

A page at a per-posting link the admin shares wherever they already advertise — WhatsApp, LinkedIn, Naukri, their own site.

1. The posting's openings, listed as real choices read from our database.
2. The ten FR-21 fields — **every one required**, no partial submissions.
3. A CV, **also required**, uploaded straight to storage. 1 MB cap.
4. Submit, and immediately see confirmation, with a plain-language note about what we do with their data.

No sign-in of any kind. Screening starts the moment they submit — not on the next 60-second poll — and the candidate waits for none of it.

---

## The one thing Google Forms genuinely bought us

**Verified email**, via FR-20's mandatory Google sign-in. It is load-bearing, not incidental: `candidate.email` is unique per organisation, FR-36's dedup rule rests on it, and FR-37 recognises one person across several openings by it.

Dropping it is the one place this proposal trades something real away rather than simply removing waste. The mechanics survive — dedup and cross-opening recognition both work on string equality, so FR-36 and FR-37 need no rewording — but the guarantee behind the string weakens: typos fork one person into two candidates, and nothing stops someone submitting under an address that is not theirs.

Decision 3 below takes that trade deliberately, records what it costs, and leaves the schema ready to reverse it.

---

## What this deletes

Not simplification in the abstract. Concretely:

- **The entire unmatched-submission concept.** FR-28 and FR-29 exist only because a candidate can type a dropdown value we do not recognise. When openings are rendered from our own database, naming an unknown one is structurally impossible.
- **FR-63, FR-64, FR-65** — never write to the sheet, reflect edits at source, flag deleted rows. All three exist only because the source of truth lives in someone else's system.
- **FR-36** — the resubmission path, retired by Decision 5 in favour of refusing a second application outright.
- **FR-19 – FR-27** — the template, the copying, the dropdown sync, the form picker.
- The 60-second poll, `last_imported_row`, `last_sweep_at`, and sheet column-header matching — which has already bitten us once, when a form typo (`Full ame`) would have silently left every candidate unnamed.
- ~1,000 lines of Google-specific code and the 144-line manual.

---

## What it costs — stated honestly

**This creates the first public surface in the product.** The functional spec currently says, flatly: *"No part of this feature is publicly reachable. Candidates interact only with Google Forms."* That line stops being true, and Google stops absorbing spam, bots, and hostile uploads on our behalf.

With no sign-in gate, the defences are all our own, and none of them individually is strong — the argument is that together they make a junk submission more expensive than it is worth:

| Control | What it stops |
|---|---|
| Unguessable per-posting link | Drive-by discovery. Nobody can enumerate open postings |
| Every field required, CV required | Trivially scripted empty submissions |
| 1 MB cap, PDF/DOCX only, verified server-side after upload | Hostile or oversized payloads |
| Rate limit per IP | Volume |
| Honeypot field and a minimum time-to-fill | Naive bots |
| Posting must be `open` | Submissions to closed drives |

Accepted deliberately: this is weaker than a sign-in wall, and some junk will get through. It lands in a pipeline where a human reviews everything anyway, and a junk application is visible and deletable rather than dangerous. If volume becomes a real problem, a CAPTCHA-style challenge is the next control to add — and email OTP the one after that.

**The browser never touches the database.** Submissions go through a server route that validates everything, so no anonymous RLS policy is ever opened and the public surface stays exactly one endpoint wide.

**We become the sole custodian of every CV.** TechDecisions §5.3 currently keeps two copies — ours and the admin's Drive — with different owners and lifespans. That redundancy goes. Worth noting it is a smaller change than it sounds: manual uploads already live only in Supabase, and §5.3 already records that asymmetry as accepted. FR-62's "open the original in Drive" simply will not apply, exactly as it does not for manual uploads today. But it does make the retention rule in TechDecisions §8 load-bearing rather than prudent — Principle 9 is doing real work here.

**We inherit form quality.** Accessibility, mobile layout, error states, and a privacy notice were Google's problem and are now ours. The notice is not decoration: we would be collecting personal data directly from individuals in India, and DPDP-style notice-and-purpose expectations apply to us, not to Google.

---

## What this is *not*

Non-Goal 3 says Ziphyre is **not a job board** — no marketplace, no owned candidate supply, *"businesses advertise where they already advertise."* A hosted application page does not cross that line: it has no discovery, no search, no browsing, and no candidate accounts. It is a link the business shares themselves.

The line worth writing down before it drifts: **we do not build a public index of postings, a browsable careers page, or candidate logins.** One posting, one link, shared by the business.

---

## Decisions taken — 23 August 2026

### 1. Google intake is removed, not demoted

The Google Form path goes entirely. This is larger than it first sounds, and worth being precise about what dies and what survives.

**Dies:** `google_connection`, `unmatched_submission`, all three sensitive scopes, the OAuth connect flow, the 60-second import poll, sheet column parsing, `docs/google-form-setup.md`, and the Settings → Connections screen. FR-1–FR-4, FR-19–FR-29 and FR-62–FR-65 retire with them.

**Survives, and must not be swept up by mistake:** **admin sign-in through Google.** That uses Supabase Auth with `openid email profile` only — non-sensitive scopes that need no verification review. Removing the *intake* integration is precisely what lets the consent screen drop to basic scopes and be published without Google's review. That is the whole commercial win; deleting admin auth alongside it would throw it away.

### 2. This lands before M4

Intake is cheaper to change before the pipeline is built on top of it, and it removes surface area M4 would otherwise have to render. Sequenced as **M3.5 — Native intake**, superseding M3 rather than rewriting its history.

### 3. No email verification in v1 — and Supabase's built-in OTP is not the shortcut it looks like

Candidates type an email address. It is not verified.

Supabase Auth does ship email OTP (`signInWithOtp`), and it was worth asking about, but three things make it the wrong first move here:

- **It does not remove the email-provider problem.** Supabase's built-in sender is rate-limited to a handful of messages an hour and is explicitly not intended for production; real use requires configuring your own SMTP. The built-in flow saves the code for generating and checking codes, not the infrastructure.
- **It mints an `app_user` for every candidate.** OTP for a new candidate requires `shouldCreateUser: true`, which inserts into `auth.users`, which fires our `handle_new_auth_user` trigger. Every applicant would get an `app_user` row and, if they ever browsed to the app, land on `/no-access`. Workable around with a metadata flag and a trigger guard, but that is a fragile check on client-supplied data guarding our identity table.
- **It issues candidates a real session on our domain.** RLS holds — `current_org_ids()` returns nothing for them — but it is a standing authenticated surface we get no value from. What we want is proof of an address, not a login.

**Decision:** ship without it. Add `candidate.email_verified boolean not null default false` in the same migration so turning verification on later is a behaviour change, not a schema migration.

**The consequence, stated plainly:** Decision 5 (one application per opening) removes the worst version of this — an unverified submission can no longer overwrite a real applicant's CV, because a second attempt is refused rather than merged.

What remains is the mirror of it: someone who knows both the posting link and a person's email address could apply *as* them first, and thereby block the real person from applying. Narrow — it needs the unguessable link, the victim's address, and a specific motive — and it fails loudly rather than silently, since the real candidate is told they have already applied and can contact the employer. Accepted for v1. It is the first thing OTP would fix if it ever shows up.

### 4. Uploads go direct to storage; the candidate never waits

**Order of operations matters here.** Upload *first*, submit second:

1. Browser asks the server for an upload slot. Server checks the posting is open and rate limits the caller, then issues a short-lived signed upload URL scoped to a single path.
2. Browser PUTs the file straight to Supabase Storage. The file body never touches the application server, which sidesteps the serverless body limit we already hit once and worked around by raising `bodySizeLimit` to 20 MB.
3. Browser submits the form fields plus the storage path. **The server verifies the object actually exists and checks its real size and type before creating the application** — the client's claims about what it uploaded are never trusted.

Doing it in this order also avoids orphaned applications with no CV attached, which is what a submit-then-upload sequence produces whenever the second step fails.

**Async screening needs no new work.** The submission handler creates the rows, enqueues `screen_application`, and returns immediately — the candidate sees "submitted" at once. That is exactly what the job queue built in M2 already does; nothing about this is new machinery.

**On the 1 MB cap.** Enforced client-side for fast feedback and server-side after upload as the authority. Worth knowing it is tight: the seven real CA CVs ran 3.5 KB to 581 KB, so they all pass comfortably, but design-heavy or scanned PDFs routinely exceed 1 MB. The overlap with unscreenable files is high — a scanned CV would fail FR-47's text-extraction check anyway — so the cap mostly rejects files we could not read regardless. Flagged rather than argued: if legitimate rejections show up, 2 MB is the obvious next stop.

---

### 5. One application per opening — refused, not merged

Yes, this is possible, and most of it is already built: `application` has carried `unique (opening_id, candidate_id)` since M2, and candidates are unique on `(organization_id, email)`. The same address therefore resolves to the same candidate row and cannot hold two applications for one opening. The database already refuses it.

What changes is the **behaviour on collision**. Today FR-36 treats a repeat as a resubmission — displace the old CV, keep the new one, queue a rescreen. Now it is simply refused. **FR-36 retires**, and `previous_cv_storage_path` and `resubmitted_at` become dead columns to drop with the rest.

**Once per *opening*, not once per posting.** FR-37 is an existing, deliberate product decision — one person may hold applications against several openings and is recognised as the same candidate. Someone genuinely suited to two different roles in one hiring drive should be able to say so. Tightening this to once-per-posting is a one-line change if you would rather stop role-shotgunning, but it contradicts FR-37 and I would not do it by default.

**What is honestly enforceable.** Without verified email, "once" is enforceable against accident, not against determination — anyone can apply again from a second address. That is worth stating plainly rather than implying the rule is airtight. It stops the duplicate submissions that actually happen (a candidate unsure whether the first one worked), which is the real problem.

**This changes the upload flow.** Decision 4 has the browser upload before it submits, so a duplicate applicant would push a 1 MB file and *then* be told they had already applied — a wasted upload and an orphaned storage object, caused by our own ordering. The fix: **the request for an upload slot must carry the email and the opening**, and the server refuses to issue a signed URL if an application already exists. The duplicate is then stopped before a single byte moves. The submit step re-checks, and the unique constraint remains the backstop against the race between the two.

**What the candidate is told.** "You have already applied for this role" — plainly. This does leak, to anyone holding the link, whether a given address has applied to a given opening. That was weighed against staying quiet and showing a false confirmation: silence would violate Principle 4 (*silence is a bug*) and Principle 10 (*say the honest thing*), and would badly mislead a real person who is simply unsure whether their first attempt landed. A narrow enumeration leak behind an unguessable link is the smaller harm.

**One thing to schedule, not solve now.** Abandoned uploads — a candidate who uploads and never submits — leave unreferenced objects in the bucket. The existing `purge_expired` retention job is the natural place to sweep objects with no owning application after a few hours.

---

## Next steps

The spec pipeline, in order — **no code until the functional spec revision is agreed.**

**1. Functional Spec revision.** Retire FR-1–FR-4, FR-19–FR-29, FR-36 and FR-62–FR-65 by marking them retired with a pointer to this note, rather than deleting the numbers — the traceability table in the tech spec maps FR ranges, and renumbering would break the audit trail this project has kept carefully everywhere else. Add the apply-page requirements as **FR-87 onward**. Rewrite §9's *"Public"* row, §4's out-of-scope line *"Anything candidate-facing beyond Google's form receipt"*, and the Later Versions row this note fulfils.

**2. Tech Spec revision.** The public route and its rate limiting, the two-step signed-upload flow with server-side verification, `posting.apply_token`, `candidate.email_verified`, widening `application.source` to include `apply`, and the removal plan for the Google tables and columns. Also: `opening.form_option_value` is `not null` with a unique constraint and exists *solely* for Google dropdown matching — it becomes dead weight and should be dropped, along with `posting`'s six Google columns and `application.cv_drive_file_id`, `source_row_number`, `previous_cv_storage_path` and `resubmitted_at`.

**3. Build, as M3.5 — Native intake.** Superseding M3 rather than rewriting its history: M3's changelog entries and STATUS record stay as written, since they were true when written.

**One migration note.** The pilot organisation holds a real form-sourced application. Removal must be non-destructive to it — drop the connection and the dead columns, keep the candidate, the application, its CV and its screening.
