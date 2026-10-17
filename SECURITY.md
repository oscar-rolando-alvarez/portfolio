# Security Policy

This repository is a portfolio of reference implementations. The projects are maintained on a best-effort basis and are not intended to be deployed to production as-is.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/oscar-rolando-alvarez/portfolio/security/advisories/new)
or email **oralvarez@gmail.com** with:

- the affected project folder and file(s),
- a description of the issue and its impact,
- steps to reproduce or a proof of concept.

You can expect an acknowledgement within 5 business days.

## Supply-chain hygiene

- Dependabot keeps dependencies and GitHub Actions up to date (`.github/dependabot.yml`).
- Every project pipeline runs a dependency vulnerability audit for its ecosystem.
- Secrets are supplied through environment variables; each project ships an `.env.example` with placeholders only.
