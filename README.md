# Twentys1x AI Studio

Local-first AI chat workspace with project import, code preview, provider switching, and a Node backend proxy for AI provider calls.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run test
npm run build
npm run security:audit
```

## Production

Configure provider API keys as server environment variables when possible:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEEPSEEK_API_KEY`
- `DOUBAO_API_KEY`
- `KIMI_API_KEY`
- `QWEN_API_KEY`

Optional external error monitoring:

- Browser Sentry: `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE`, `VITE_SENTRY_TRACES_SAMPLE_RATE`
- Backend Sentry: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`

When DSNs are empty, the app keeps the local `/api/client-errors` fallback logging enabled and skips external uploads. Error reports are scrubbed for API-key-like values and bearer tokens before logging or forwarding.

Then build and run:

```bash
npm run build
HOST=0.0.0.0 PORT=8787 node server/index.mjs
```

Docker deployment:

```bash
docker compose up --build
```

## Compliance Templates

Before public launch, review and adapt:

- `PRIVACY.md`
- `TERMS.md`
- `COOKIE_POLICY.md`
- `SECURITY.md`
