# Release gates — Sovereign Expense

This document tracks requirements for a trustworthy initial public release. Passing a GitHub Actions workflow is **not** a production security audit.

## Completed and independently checkable

- [x] Public GitHub repository and clear README explaining the pre-release status.
- [x] Security reporting and contribution guidance.
- [x] Automated frontend build, backend syntax checks, and unit tests.
- [x] Disposable PostgreSQL integration tests in GitHub Actions covering basic groups, expenses, settlements, and authorization. The exact CI commit must pass before this is treated as verified.
- [x] Initial authentication, WebSocket, transaction, expense-splitting, and group-balance hardening proposed in [PR #1](https://github.com/worksyedbukhari/sovereign-expense/pull/1).

## Required before a public release with real users

- [ ] **Code ownership and license approval:** maintainer confirms redistribution rights for original source, generated files, graphics, third-party dependencies, fonts, and other assets. Do not merge the proposed MIT license until cleared.
- [ ] **Production-like staging:** provision a separate staging database and service, set HTTPS and CORS, test SMTP registration and reset, load sample *synthetic* users, and validate authentication, accounts, groups, expenses, chat, reports, and settlements in the browser.
- [ ] **Migration and rollback:** exercise migrations on a realistic backed-up staging copy and prove restore works.
- [ ] **Financial audit:** verify amounts, historical data conversion, overpayments, debt simplification across multiple groups, fractional cent rules, and currency-specific minor units. Do not claim multi-currency accounting support without tested exchange-rate and rounding policy.
- [ ] **Security audit:** test every endpoint and Socket.IO permission boundary, token lifecycle and revocation, OTP rate limits, dependency and secret scanning, database TLS, deployment security headers, and authentication recovery.
- [ ] **Load and reliability:** test concurrent writes, duplicate payment requests, high-volume pagination, timeouts, failure recovery, scheduled jobs, and monitoring.
- [ ] **UX and accessibility:** test login, registration, group creation, accessibility, keyboard and mobile behavior, errors, empty states, and browser compatibility.
- [ ] **Human review:** review PR changes, test evidence, and deployment plan, resolve open findings, approve merge.
- [ ] **Release:** tag a version, provide release notes, publish a verified demo if practical, and invite genuine user feedback using synthetic data.

## Environment & testing

GitHub CI uses its **own ephemeral PostgreSQL 16 service**. This is not a public staging or production instance. It verifies specific API flows only, not a complete app deployment.

To run integration tests yourself, use an **empty, dedicated test database** and set `RUN_DB_INTEGRATION=1`, `DATABASE_URL`, and `JWT_SECRET`. Never run the integration suite against a user database because tests create and delete records.

## Maintainer approval still needed

The final MIT licensing decision and production deployment need explicit confirmation from the copyright owner and someone who can verify all included source and assets. Security audit and deploy sign-off cannot be inferred from code changes alone.

OpenAI application selections are made by OpenAI; completing this checklist does not guarantee any grant or subscription.
