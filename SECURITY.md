# Security Policy

Sovereign Expense manages user accounts and financial information. Do not disclose real personal or financial data in bug reports.

## Reporting vulnerabilities

Use GitHub's private vulnerability-reporting feature if the repository has it enabled. Otherwise contact the repository maintainer privately through an established channel. Do not post detailed exploits, account tokens, or secrets to public issues.

Please include the affected feature, impact, steps to reproduce with synthetic data, and a suggested fix if available. This project does not guarantee a response SLA.

## Important deployment limitations

This project has **not** undergone an independent security assessment, and should not be described as enterprise-certified or suitable for regulated financial use.

- Require HTTPS and securely managed secrets.
- Configure backups, tested restore procedures, secure database TLS and restricted CORS.
- Deploy email-based OTP only with reliable SMTP and rate limits at the edge.
- The legacy social-login shortcut has been disabled until server-side identity-provider verification is implemented.
- Run database migrations against a backed-up staging copy before production.
- Audit permission checks on **every** API endpoint and verify Socket.IO room isolation.
- Add threat-model, dependency scanning, end-to-end, load, and recovery tests before production deployment.
