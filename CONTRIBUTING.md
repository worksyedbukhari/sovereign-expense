# Contributing to Sovereign Expense

Thanks for your interest in improving Sovereign Expense.

- Search existing issues before starting. For significant architectural changes, open an issue to discuss the design first.
- Create a focused branch, explain why the change is needed, and include regression tests where relevant.
- Run `cd backend && npm ci && npm test`, and `cd frontend && npm ci && npm run build` before opening a pull request.
- Never submit real financial data, user records, passwords, credentials, or private keys.
- Use synthetic data for security tests and report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Pull requests should explain the implementation, compatibility implications, and tests performed; include screenshots for visible interface changes.

Contributions are reviewed for security, correctness, accessibility, and compatibility. The maintainers may request changes before merging.

**License note:** The maintainer must confirm that they own or have permission to sublicense all included code and assets before final public release.
