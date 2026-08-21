# Testing

## Why `baseline-ranking-CA-role.md` is not in this repository

It is deliberately gitignored, along with `CA Role Sample Resumes/`.

Both contain **real candidates' personal data** — names, contact details, salary
history, and written assessments of seven people who applied for a Chartered
Accountant role. They applied for a job. Publishing that would be a breach of
the trust described in ProductContext Principle 9.

## What the baseline is, and why it matters

An independent human ranking of those seven applicants against the pilot
job description, produced **before any screening existed** — so it cannot be
adjusted after the fact to match whatever the product turns out to produce.

It is the yardstick the functional spec's success criteria are measured against
(`docs/functional-specs/admin-dashboard-intake-screening.md` §2), and the exit
condition for milestone **M2** in the tech spec. Without it there is no honest
way to answer the only question that matters about screening: *is the ranking
trustworthy?* Comparing the output to a ranking produced after seeing that
output is marking your own homework.

## If you are working on this project

Ask the repository owner for the file directly. Keep it local. Refer to
candidates by initials or as C1–C7 in anything shared, published, or committed.
