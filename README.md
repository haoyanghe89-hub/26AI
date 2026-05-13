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

## Data Backup & Migration

### Automatic Backup (recommended)

The project ships with an automatic backup script supporting daily / weekly / monthly rotation:

```bash
# Manual backup
bash scripts/backup.sh

# With custom directories
BACKUP_DIR=/mnt/nas/twentys1x-backups bash scripts/backup.sh

# Add to crontab for automatic daily backup (2:00 AM)
# crontab -e
# 0 2 * * * cd /path/to/twentys1x && bash scripts/backup.sh >> backups/backup.log 2>&1
```

**Backup strategy:**

| Frequency | Trigger      | Retention |
| --------- | ------------ | --------- |
| Daily     | Every run    | Last 7    |
| Weekly    | Monday only  | Last 4    |
| Monthly   | 1st of month | Last 3    |
| SQLite    | Every run    | Last 14   |

**Backup directory structure:**

```
backups/
├── daily/          # Daily archives
├── weekly/         # Weekly archives (Mon)
├── monthly/        # Monthly archives (1st)
└── twentys1x-backup-*.db  # Standalone SQLite snapshots
```

### Restore from Backup

```bash
# Restore full data directory
bash scripts/restore.sh backups/daily/twentys1x-backup-20260513_120000-daily.tar.gz

# Restore SQLite only
bash scripts/restore.sh backups/twentys1x-backup-20260513_120000-sqlite.db
```

The restore script will:

1. Stop running containers automatically
2. Create a rollback backup of current data before overwriting
3. Restore the selected backup
4. Restart containers

### Docker Volume Persistence

In `docker-compose.yml`, the `twentys1x-data` named volume is mounted at `/app/data`. This volume persists across container restarts and rebuilds.

To migrate data between hosts:

```bash
# Export volume data
docker run --rm -v twentys1x_twentys1x-data:/data -v $(pwd):/backup alpine tar czf /backup/twentys1x-data-export.tar.gz -C /data .

# Import on target host
docker run --rm -v twentys1x_twentys1x-data:/data -v $(pwd):/backup alpine tar xzf /backup/twentys1x-data-export.tar.gz -C /data
```

### Data Storage Details

| Data                     | Location          | Format            |
| ------------------------ | ----------------- | ----------------- |
| Chat sessions & messages | `data/app.sqlite` | SQLite (WAL mode) |
| User settings & agents   | `data/app.sqlite` | SQLite            |
| Project metadata         | `data/app.sqlite` | SQLite            |
| Project file indexes     | `data/projects/`  | JSON chunks       |

## Compliance Templates

Before public launch, review and adapt:

- `PRIVACY.md`
- `TERMS.md`
- `COOKIE_POLICY.md`
- `SECURITY.md`
