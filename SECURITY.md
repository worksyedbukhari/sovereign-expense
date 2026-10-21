# Security Policy

## Project status

Sovereign Expense is currently **pre-release**. No version is independently security-audited or approved for handling sensitive or regulated financial data. **Do not use real banking data, passwords, personal information, or financial records to test the app.**

The public default branch has legacy behavior that is under review. Proposed fixes can be inspected in [draft security PR #1](https://github.com/worksyedbukhari/sovereign-expense/pull/1); changes in a pull request should **not** be assumed to be released.

## Reporting security issues

Do not open public issues containing passwords, access tokens, exploits, sensitive financial records, or private vulnerabilities. If GitHub private vulnerability reporting is enabled, use that feature. Otherwise, contact the repository owner privately through a trusted channel.

Please describe the affected feature, potential impact, reproduction steps using synthetic data, and relevant environment details without attaching secrets.

There is not yet a published security response-time guarantee.

## Production release blockers

- Verify authentication, authorization, password recovery, and session revocation against a staging PostgreSQL database.
- Review **every** HTTP endpoint and Socket.IO event for data isolation and least privilege.
- Enable rate limits, secure headers, trusted origins, proper HTTPS, and verified database TLS.
- Audit third-party dependencies and scan for exposed secrets.
- Confirm financial computations, database migrations, and rollback/restore procedures.
- Add end-to-end, concurrency, negative-permission, and recovery tests.
- Review software and asset licensing rights before public release.

Passing syntax checks, unit tests, or a React build is not equivalent to a penetration test, production certification, or proof of secure deployment.
