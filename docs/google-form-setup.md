# Setting up the application form

**Who this is for:** the admin setting up Ziphyre for the first time.
**Why it's a manual step:** the form lives in *your* Google account, not
ours. Ziphyre holds read-only access and can never create or edit a form on
your behalf — that's a deliberate design decision, not a missing feature
(tech spec §5.1).

Everything below is required by **FR-19 – FR-25** of the functional spec.
Where a setting looks fussy, there's a note saying what breaks without it.

---

## 1. Create the form

Go to [forms.google.com](https://forms.google.com) and create a blank form.
Name it something you'll recognise — the name is what you'll pick from a list
inside Ziphyre later.

---

## 2. Add the questions

Add these **ten questions, in this order**. The order isn't cosmetic:
Ziphyre reads the response sheet by column position.

| # | Question | Type | Required | Notes |
|---|---|---|---|---|
| 1 | Full name | Short answer | Yes | |
| 2 | Current location | Short answer | Yes | City is enough |
| 3 | Willingness to relocate | Multiple choice | Yes | **Exactly three options: `Yes`, `No`, `Open to discussing`** (FR-23) |
| 4 | Work experience — years | Short answer | Yes | Response validation → Number → *Greater than or equal to* `0` (FR-22) |
| 5 | Work experience — months | Short answer | Yes | Response validation → Number → *Between* `0` and `11` (FR-22) |
| 6 | Notice period | Short answer | Yes | |
| 7 | Current CTC | Short answer | Yes | |
| 8 | Expected CTC | Short answer | Yes | |
| 9 | Upload your CV | File upload | Yes | See §3 |
| 10 | Role applied for | **Dropdown** | Yes | See §4 |

You do **not** add an email question. Google collects the email itself —
see §5.

---

## 3. The CV upload question

Set it up as:

- **File type:** restrict to **PDF** and **Document** only (FR-24 —
  PDF, DOC, DOCX).
- **Maximum number of files:** 1
- **Maximum file size:** 10 MB is plenty.

> **Note:** Google requires respondents to be signed in to upload a file.
> That's fine — we require sign-in anyway (§5).

> **On `.doc` files:** Ziphyre accepts them but can't read the old binary
> `.doc` format, so those land as *Needs manual review* rather than being
> scored. PDF and `.docx` both read fine. Worth saying so in the question's
> description text.

---

## 4. The "Role applied for" dropdown

This is the one that connects the form to Ziphyre, so it needs care.

The options must match the openings you configured in Ziphyre **exactly** —
character for character. Ziphyre matches on the literal string, deliberately:
you may word the dropdown differently from the internal role title, and
matching on the title instead would break silently the moment they diverge.

**Don't type these by hand.** In Ziphyre, open your posting and use the
*Copy these, exactly as written* list, then paste each option in.

If an option doesn't match any opening, applications naming it aren't lost —
they're held as **Unmatched** for you to assign by hand (FR-28). It's just
extra work, so it's worth getting right.

---

## 5. Settings that matter

Open **Settings** (the gear icon) and set:

### Responses

| Setting | Value | What breaks otherwise |
|---|---|---|
| **Collect email addresses** | **Verified** | Ziphyre identifies a candidate by their verified email. This is what recognises one person applying to two roles as one person (FR-37), and what makes a repeat submission update the existing application instead of creating a duplicate (FR-36). Without it, intake can't identify anyone. |
| **Limit to 1 response** | **Off** | FR-20. A candidate should be able to correct a mistake by resubmitting; Ziphyre handles that as an update, keeps the previous CV, and offers a rescreen. |
| **Allow response editing** | **On** | FR-64 exists specifically so edits at your end are reflected in the application. |

### Presentation

Nothing required. Add whatever intro text you like.

---

## 6. Link the response sheet

**Responses** tab → **Link to Sheets** → *Create a new spreadsheet*.

Ziphyre reads applications from this sheet, not from the form directly. It
never writes to it — we hold no write permission at all, which is what makes
FR-63 ("never writes to the response sheet") impossible to violate rather
than merely forbidden.

Leave the sheet where it is and don't rename its columns.

---

## 7. Connect it in Ziphyre

1. **Settings → Connections → Connect Google account.** Approve the
   read-only access to Forms, Sheets and Drive.
2. Open your posting → **Connect your application form** → pick the form
   from the list. (You never paste a link — FR-26.)
3. Ziphyre compares the dropdown options against your openings and tells you
   about any mismatch in either direction. Fix the form and re-check, or
   continue and handle unmatched applications later.

Then share the form link wherever you're advertising the role. Submissions
arrive in the pipeline on their own, screened, with no further action from
you.

---

## Troubleshooting

**"Ziphyre has lost access to your Google account."**
The permission was revoked or expired. Reconnect from Settings →
Connections. Candidates already in your pipeline are unaffected — their CVs
are stored in Ziphyre, not read live from your Drive.

**A submission didn't appear.**
Check the posting is still open — a closed posting stops accepting new
applications (FR-10). Then check the response actually reached the linked
sheet.

**Everything's landing as Unmatched.**
The dropdown options don't match your opening names exactly. Compare against
the copyable list on the posting page — a trailing space or a different dash
character is enough to break the match.
