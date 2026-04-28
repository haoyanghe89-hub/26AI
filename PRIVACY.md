# Privacy Policy

Last updated: 2026-04-28

Twentys1x is an AI chat workspace intended for local-first use.

## Data We Process

- Chat messages and session metadata.
- Uploaded text files, images, and imported project files selected by the user.
- AI provider configuration such as selected provider and model.
- API keys only when the user chooses to store them locally.
- Client error reports containing sanitized error messages and technical metadata.

## Local Storage

The application stores client state in browser storage. API keys are encrypted with the browser Web Crypto API before being persisted in IndexedDB. This protects against casual local inspection, but it is not a replacement for server-side secret management on shared or compromised devices.

## Server Processing

The backend proxies requests to the selected AI provider. If provider API keys are configured as server environment variables, the frontend does not need to send user-provided API keys.

Project import, indexing, file preview, and file write operations are handled by the backend for the selected workspace/project.

## Third-Party AI Providers

When you send a message, the message content and relevant attachments/context may be sent to the configured AI provider. Each provider processes data according to its own terms and privacy policy.

## Error Reports

Client error reports are sent to `/api/client-errors` to help diagnose failures. API-key-like strings and bearer tokens are redacted before logging.

## Data Retention

For local deployments, retention depends on the browser storage and the server `data` directory. Operators are responsible for their own backup and deletion policies.

## Contact

For production deployments, replace this section with the operator's contact and data rights process.
