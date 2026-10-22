# Sovereign Expense

**Shared expenses, group balances, and settlement tracking — an early-stage, self-hostable web application.**

Sovereign Expense is a public project exploring a straightforward way for households, roommates, and teams to record expenses and understand who owes whom. It includes a React browser frontend, an Express/Socket.IO backend, and PostgreSQL storage.

> **Project status: development / pre-release.** This repository is publicly viewable, but it is **not** an independently audited financial product. There is currently no verified public demo or production-ready release. Use **fictional data only** when evaluating it. Security hardening, testing, documentation, and licensing are being reviewed in [draft pull request #1](https://github.com/worksyedbukhari/sovereign-expense/pull/1).

## What is in the repository?

- Account registration, authentication, and profile interfaces
- Group expense entry and participant splits
- Settlement and balance tracking
- Group chat and spending analytics
- Responsive React frontend in [`frontend/`](frontend/)
- Node.js / Express API and Socket.IO backend in [`backend/`](backend/)

These are implemented project areas, **not a claim that every feature has passed end-to-end or security testing**.

## Companion project: Sovereign Studio

[Sovereign Studio](projects/sovereign-studio/README.md) is an independently developed, responsive settlement-planning tool within this repository. It runs entirely in the browser, uses integer-cent calculations, shows editable scenarios and suggested repayments, and exports CSV reports. It requires **no account, API key, or server** for calculations. It has its own scoped [MIT license](projects/sovereign-studio/LICENSE); this license **does not apply** to the original full-stack expense app, whose release and asset licensing review remain pending.

## Architecture

| Component | Technology |
| --- | --- |
| Frontend | React, React Router, Recharts |
| Backend | Node.js, Express, Socket.IO |
| Database | PostgreSQL |
| Development | npm, Docker/deployment configuration |

## Try it locally (development only)

You will need Node.js (see [`.nvmrc`](.nvmrc)), npm, a local PostgreSQL database, and appropriate environment configuration.

1. Clone the repository: `git clone https://github.com/worksyedbukhari/sovereign-expense.git`
2. Create a PostgreSQL database named `sovereign_expense`.
3. Create `backend/.env` locally. Set `DATABASE_URL` to your local PostgreSQL connection string and `JWT_SECRET` to a long, randomly generated secret. Configure SMTP credentials if email functions are needed. **Never commit secrets or real credentials.**
4. In one terminal: `cd backend && npm ci && npm run dev`.
5. In another terminal, from the repository root: `cd frontend && npm ci && npm start`.
6. Open `http://localhost:3000`. The API normally listens on port `5000`.

The above instructions are for a **local evaluation**, not a verified production deployment. Email verification and third-party functions may need additional credentials. Running the browser frontend alone does not provide working accounts or group expense data.

## Security and financial-data limitations

This software is undergoing security and financial-correctness work. Do **not** deploy it publicly with real credentials or sensitive personal/financial information until a full review has been completed. Planned verification includes database integration, authorization checks, dependency and authentication review, financial edge cases, and backup/restore testing.

You can inspect the [security and open-source readiness work in PR #1](https://github.com/worksyedbukhari/sovereign-expense/pull/1). Its CI checks do **not** replace end-to-end tests or an independent security audit.

For a verifiable list of deployment, audit, licensing, and review requirements, see [Release gates](docs/RELEASE_GATES.md).

## Roadmap

- [x] Publish an inspectable repository and document the existing project
- [ ] Review and merge security fixes after testing
- [ ] Verify financial calculations and database migrations in staging
- [ ] Add repeatable end-to-end tests and release instructions
- [ ] Publish a verified demo and initial tagged release
- [ ] Invite genuine beta feedback and review contributions

## Contributing and license

Feedback and carefully scoped bug reports are welcome via [GitHub Issues](https://github.com/worksyedbukhari/sovereign-expense/issues). Please use synthetic data in examples. Report security vulnerabilities privately, rather than posting working exploits or secrets in public issues.

**License review pending:** A proposed MIT license is included in PR #1, but the maintainer must verify the redistribution rights for all code and assets before licensing the complete repository. Until that review is finished, do not assume this repository is licensed for unrestricted reuse.

Maintainer: [@worksyedbukhari](https://github.com/worksyedbukhari)
