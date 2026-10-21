# Contributing to Sovereign Expense

Thank you for your interest in helping improve Sovereign Expense.

The project is in a **pre-release review stage**. The default branch contains the current prototype; [draft PR #1](https://github.com/worksyedbukhari/sovereign-expense/pull/1) proposes security, correctness, licensing, and testing improvements.

## Start with an issue

Before a substantial code change, open a GitHub issue explaining the problem and the intended solution. Small, focused bug reports and design feedback are welcome. Use fictional financial records and never include personal information or secrets.

## For code contributions

1. Fork the repository and create a focused branch.
2. Explain what your change does and why.
3. Include regression tests where practical.
4. Verify relevant code locally. On the default branch you can run `npm ci` and `npm run build` inside `frontend/`, and `node --check backend/server.js`. On the security branch you can also run `cd backend && npm ci && npm test`.
5. Submit a pull request with reproduction steps and screenshots for visual changes.

Security issues should be reported **privately**, as described in [SECURITY.md](SECURITY.md).

## Licensing

Repository licensing and all third-party code/asset rights are still being verified. The proposed MIT license in PR #1 is not yet merged. Please do not assume code can be redistributed under MIT until this is resolved. The maintainer may defer code contributions until the licensing review is complete.
