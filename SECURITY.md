# Security Policy

## Supported Versions

This project is pre-1.0. Security fixes should target the main development line unless a deployment branch is maintained separately.

## Current Security Controls

- Frontend AI calls go through the backend proxy.
- Server-configured provider API keys are preferred over frontend-submitted keys.
- Locally stored API keys are encrypted before persistence in IndexedDB.
- Message HTML and syntax-highlighted HTML are sanitized before rendering.
- File uploads use a size limit, type/extension allowlist, and SHA-256 hashing.
- Client error reports redact API-key-like strings and bearer tokens before logging.

## Reporting a Vulnerability

For private deployments, report vulnerabilities to the system operator. Include:

- Affected version or commit.
- Reproduction steps.
- Expected and actual impact.
- Whether secrets, files, or user data may be exposed.

## Production Checklist

- Configure provider API keys through server environment variables.
- Serve over HTTPS.
- Restrict CORS to trusted origins.
- Add authentication before enabling multi-user deployments.
- Keep dependencies updated and run `npm run security:audit` in CI.
- Review privacy, terms, and cookie documents with legal counsel before public launch.
