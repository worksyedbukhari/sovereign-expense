# Sovereign Studio

**A standalone shared-expense scenario planner with a premium, responsive browser interface.**

Sovereign Studio is a new companion project built within the [Sovereign Expense](../../README.md) repository. Unlike the existing full-stack app, Studio is **entirely client-side**: it can run locally with no signup, server, remote API, or third-party dependencies.

## What you can do

- Choose from three editable starter scenarios (weekend travel, shared apartment, team offsite).
- Add or remove up to 12 participants and edit what each person contributed.
- Calculate equal shares precisely using **integer cents**, including remainder allocation.
- Visualize contributions versus each participant's fair share.
- Get deterministic, transparent suggested repayments.
- Download a CSV report. Untrusted spreadsheet text is escaped to prevent formula execution.
- Switch display denominations: USD, SAR, EUR, PKR (always two-decimal, with **no currency conversion**).
- Use the interface on mobile, with keyboard focus states and reduced-motion support.

No scenario information leaves the browser. Nothing is stored on the server, and data is not persisted across refreshes.

## Open it

The easiest option: **download the repository and open `projects/sovereign-studio/index.html` in a modern browser**. All paths are relative. For local development, use any simple static web server, for example:

```sh
cd projects/sovereign-studio
python -m http.server 8000
```

Then visit `http://localhost:8000`. Python is only needed for this optional local server. JavaScript modules also work with other static development servers. Some browsers disallow ES modules from `file://` URLs, so serving locally is the most reliable method.

## Run tests

```sh
cd projects/sovereign-studio
npm test
npm run check
```

Node.js 20+ is required for the automated tests. No dependency installation or API key is needed.

## Architecture

- `src/engine.mjs`: framework-free scenario analysis, settlement calculations, validation, and CSV export.
- `src/app.mjs`: DOM-driven interactive interface (no user-controlled `innerHTML`).
- `styles.css`: responsive design system, accessibility and motion preferences.
- `test/engine.test.mjs`: reproducible unit tests using Node's built-in test runner.
- `mark.svg`: original vector identity.

## Important limitations

- Studio is a **scenario planning aid**, not a payment processor, bank, accounting ledger, financial adviser, or a way to transfer money.
- Fair share is always **equal** across participants; there is no percentage-weighted split mode.
- It supports display only for four **two-decimal** currencies. It does not convert currencies or combine different denominations.
- Payments are modeled with one payment entry per participant. There is no bank integration, authentication, or cloud synchronization.
- Suggested repayments use a deterministic greedy matching algorithm; this does **not** prove the mathematically minimum number of transfers for every input.
- There is no verified public hosted demo yet. A production-grade release still requires a human review, device testing, and project-level licensing approval.

## Why this belongs in the same repository

Sovereign Expense is the collaborative, full-stack product. Sovereign Studio is a portable, dependency-free companion for modeling a split **before** recording an expense in the main application. Keeping them together encourages shared correctness tests, issue tracking, and genuine contributions without misrepresenting them as unrelated mature products.

## License

**Sovereign Studio**, including its own source files, styles and original vector mark under this directory, is licensed under the [MIT License](LICENSE).

This **does not license the rest of the Sovereign Expense repository**. The original full-stack application's third-party code and asset review remains separate.

## Quality checks

GitHub Actions runs both the Node unit suite and an actual Chromium browser smoke test covering desktop and mobile interactions, CSV download, and absence of horizontal mobile overflow. Those automated tests do not replace comprehensive accessibility audits, performance profiling or manual visual review.

Contributions and usability feedback are welcome. Use fictional data in any example. See the root [security policy](../../SECURITY.md) and [contributing guide](../../CONTRIBUTING.md).
