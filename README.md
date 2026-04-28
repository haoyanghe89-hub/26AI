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
