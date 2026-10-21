# Sovereign Expense

Sovereign Expense is a self-hostable expense-sharing application for tracking group spending, managing balances and settlements, and exploring spending reports. The repository includes a React frontend, an Express / Socket.IO backend, and PostgreSQL.

> **Security status:** This is an actively maintained project, not a certified banking or accounting product. Review [SECURITY.md](SECURITY.md) before exposing it to real users or uploading sensitive financial information.

## Features
- Account registration and sign-in, with email verification
- Shared groups and expense tracking
- Equal or explicitly supplied custom splits
- Group chat, settlement records, balances, and spending analytics
- Responsive browser interface and Docker/deployment configuration

## Requirements
- Node.js 22 or later (recommended for local development)
- PostgreSQL 14 or later
- SMTP credentials for registration and password-recovery emails

## Local development

1. Clone the repo:
   ```sh
   git clone https://github.com/worksyedbukhari/sovereign-expense.git
   cd sovereign-expense
   ```
2. Create a PostgreSQL database named `sovereign_expense`.
3. Copy `backend/.env.example` to `backend/.env`, then set `DATABASE_URL`, a strong random `JWT_SECRET`, and SMTP credentials. Do not commit `.env` or any real credentials.
4. In one terminal run `cd backend && npm ci && npm run dev`; in another run `cd frontend && npm ci && npm start`.
5. Open http://localhost:3000. The API listens on http://localhost:5000 by default.

The database tables are initialized on backend startup. Existing installations created before monetary type changes should review `migrations/001_amounts_to_numeric.sql` and back up all data before applying that migration.

## Quality checks
- Backend: `cd backend && npm test`
- Backend syntax: `node --check backend/server.js`
- Frontend production build: `cd frontend && npm ci && npm run build`
- CI configuration: `.github/workflows/ci.yml`

## Operational notes
- New email/password accounts require an SMTP-delivered one-time code. Verification codes are never returned by the API. Without SMTP, registration and password recovery are unavailable.
- The former `/api/auth/social-login` shortcut is deliberately disabled because it did not validate identity-provider tokens. Do not re-enable it without server-side provider verification.
- Authenticated Socket.IO connections use `auth: { token }`; sending chat messages goes through the REST API, which persists messages and emits the saved record.
- Currency storage uses two decimal places. **Currencies with other minor-unit conventions are not yet fully supported.** Do not use this application for mixed-currency accounting without appropriate conversions and tests.
- Configure HTTPS, appropriately restricted CORS, secret rotation, backups, email rate limits, and monitoring before internet deployment.

## Community
Read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution instructions and [SECURITY.md](SECURITY.md) for private security reporting. Issues and pull requests are welcome. The project is released under the [MIT License](LICENSE).

## Maintainer
[worksyedbukhari](https://github.com/worksyedbukhari)

Maintainers should only claim verified community usage or contribution statistics when applying to outside programs; making a repository public alone does not establish open-source ecosystem impact.
