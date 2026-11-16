# Security policy

## Reporting a problem

Please report security problems **privately**, not in a public issue: use
GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (the **Security** tab, then **Report a vulnerability**).

Include what you found, how to reproduce it, and what an attacker could do
with it. This is a one-person project, so please allow some time for a reply.
Once a fix is released, the report can be published as an advisory, with
credit if you'd like it.

## What's in scope

- Secrets or personal data committed to the repository.
- From v0.2: the code that runs analyses, including how uploaded data is
  handled.

A methodological error in the map (a pathway that shouldn't be valid, or a
wrong source) isn't a security problem. Please open a methodology issue for
it instead.

## Known limits (by design)

- The app has no accounts and stores nothing. Version 0.1 is a static page:
  it sends no data anywhere.

## Supported versions

Only the latest release (and `main`) gets fixes.
