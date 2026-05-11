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

Authentication:

- `AUTH_TOKEN_SECRET`: signing secret for local login tokens.
- `AUTH_SMS_WEBHOOK_URL`: real SMS webhook endpoint. The backend sends `{ phone, code, purpose, expiresInSeconds }`; the webhook must deliver the SMS.
- `AUTH_SMS_WEBHOOK_TOKEN`: optional bearer token for the SMS webhook.
- `AUTH_ALIYUN_SMS_ACCESS_KEY_ID`, `AUTH_ALIYUN_SMS_ACCESS_KEY_SECRET`, `AUTH_ALIYUN_SMS_SIGN_NAME`, `AUTH_ALIYUN_SMS_TEMPLATE_CODE`: enables direct Alibaba Cloud SMS delivery. The SMS template should include a variable named `code` unless `AUTH_ALIYUN_SMS_TEMPLATE_PARAM_NAME` is changed.
- `AUTH_PUBLIC_BASE_URL`: public app origin used to build OAuth callback URLs.
- `AUTH_CLIENT_BASE_URL`: client origin to return to after OAuth callback.
- `AUTH_WECHAT_CLIENT_ID`, `AUTH_WECHAT_CLIENT_SECRET`: enables WeChat QR OAuth.
- `AUTH_QQ_CLIENT_ID`, `AUTH_QQ_CLIENT_SECRET`: enables QQ OAuth.

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
