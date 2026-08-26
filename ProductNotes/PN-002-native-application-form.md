# Product Note 002 — Ziphyre's Own Application Form

**Status:** Draft — for discussion, not yet ready for Functional Spec
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
2. "Continue with Google" to establish a verified email.
3. The ten FR-21 fields, with validation actually enforced rather than described in a manual.
4. Upload a CV. Submit. A confirmation, and a plain-language note about what we do with their data.

Screening starts the moment they submit — not on the next 60-second poll.

---

## The one thing Google Forms genuinely bought us

**Verified email.** It is load-bearing, not incidental: `candidate.email` is unique per organisation, FR-36's dedup rule rests on it, and FR-37 recognises one person across several openings by it. FR-20 exists precisely to guarantee it.

Three ways to keep it:

| Option | Verdict |
|---|---|
| **Google sign-in on our own page** | **Recommended.** Uses only `openid email profile` — non-sensitive scopes, no verification review. And it is **zero net new friction**: FR-20 already forces candidates through Google sign-in today. A like-for-like swap that preserves the identity model with no change to FR-36 or FR-37. |
| Email OTP | Works for everyone, including non-Google users. Needs transactional email, which this build does not have (tech spec open question #3). Worth adding later as an alternative, not as the first move. |
| Accept a typed email | Simplest, and quietly corrosive. Typos fork one person into two candidates; anyone can apply as anyone. It would weaken the dedup guarantee the whole identity model is built on. |

One implementation trap to name now: this must **not** create a Supabase Auth session. Our `handle_new_auth_user` trigger creates an `app_user` row on every `auth.users` insert, so signing candidates in through Supabase Auth would mint an `app_user` for every applicant and land them on `/no-access`. What we want is far smaller — verify a Google ID token server-side, read the verified email off it, discard the rest. Proof of address, not a login.

---

## What this deletes

Not simplification in the abstract. Concretely:

- **The entire unmatched-submission concept.** FR-28 and FR-29 exist only because a candidate can type a dropdown value we do not recognise. When openings are rendered from our own database, naming an unknown one is structurally impossible.
- **FR-63, FR-64, FR-65** — never write to the sheet, reflect edits at source, flag deleted rows. All three exist only because the source of truth lives in someone else's system. FR-36's resubmission path already covers "the candidate sent a new version."
- **FR-19 – FR-27** — the template, the copying, the dropdown sync, the form picker.
- The 60-second poll, `last_imported_row`, `last_sweep_at`, and sheet column-header matching — which has already bitten us once, when a form typo (`Full ame`) would have silently left every candidate unnamed.
- ~1,000 lines of Google-specific code and the 144-line manual.

---

## What it costs — stated honestly

**This creates the first public surface in the product.** The functional spec currently says, flatly: *"No part of this feature is publicly reachable. Candidates interact only with Google Forms."* That line stops being true, and Google stops absorbing spam, bots, and hostile uploads on our behalf. Requiring Google sign-in filters most of it; the rest needs an unguessable per-posting link, rate limiting, file type and size validation, and a posting that must be open to accept. The browser should never touch the database directly — submissions go through a server route that validates everything, so no anonymous RLS policy is ever opened.

**We become the sole custodian of every CV.** TechDecisions §5.3 currently keeps two copies — ours and the admin's Drive — with different owners and lifespans. That redundancy goes. Worth noting it is a smaller change than it sounds: manual uploads already live only in Supabase, and §5.3 already records that asymmetry as accepted. FR-62's "open the original in Drive" simply will not apply, exactly as it does not for manual uploads today. But it does make the retention rule in TechDecisions §8 load-bearing rather than prudent — Principle 9 is doing real work here.

**We inherit form quality.** Accessibility, mobile layout, error states, and a privacy notice were Google's problem and are now ours. The notice is not decoration: we would be collecting personal data directly from individuals in India, and DPDP-style notice-and-purpose expectations apply to us, not to Google.

---

## What this is *not*

Non-Goal 3 says Ziphyre is **not a job board** — no marketplace, no owned candidate supply, *"businesses advertise where they already advertise."* A hosted application page does not cross that line: it has no discovery, no search, no browsing, and no candidate accounts. It is a link the business shares themselves.

The line worth writing down before it drifts: **we do not build a public index of postings, a browsable careers page, or candidate logins.** One posting, one link, shared by the business.

---

## Open questions for discussion

1. **Does Google intake survive?** Recommendation: keep it, demote it. Native becomes the default and only path for new postings; the Google importer stays for "already collecting in a Sheet?" and is not promoted. That preserves working, verified code and makes OAuth optional rather than mandatory. The counter-argument is real, though — two intake paths is two sets of bugs for a solo builder, and if nobody uses the importer, deleting it also deletes the entire OAuth surface, the sensitive scopes, and the verification requirement outright.
2. **Where does this sit in the build order?** M4 (Pipeline) is next. This argues for jumping ahead of it: intake is cheaper to change before more is built on top, it removes surface area M4 would otherwise have to render (the unmatched queue), and Google's review queue has a long lead time we would rather not enter at all. Against: the pilot works today on the Google Form, and M4 is what makes the product usable day-to-day.
3. **Non-Google candidates.** Ziphyre's manual-upload path already exists as the stated fallback for "candidates who can't or won't sign in to Google" (PN-001 §3). Is that sufficient for v1, or does OTP need to ship alongside?
4. **CV upload mechanics.** Direct-to-storage via a signed upload URL, or through our server? The former avoids serverless body limits — which we have already hit once and worked around by raising `bodySizeLimit` to 20 MB. A decision for the tech spec, flagged here because it affects the abuse surface.

---

## If this is agreed

The spec pipeline, in order: revise the **Functional Spec** (retire FR-19–FR-29 and FR-63–FR-65, add the apply-page requirements, rewrite §9's "Public" row and §4's out-of-scope line *"Anything candidate-facing beyond Google's form receipt"*), then the **Tech Spec** (public route, ID-token verification, upload path, rate limiting, `posting.apply_token`, widening `application.source`), then build.

No code until the functional spec revision is agreed.
