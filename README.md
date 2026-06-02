# 宠物 AI 管家 / Pet AI Manager

AI-powered pet family management workspace for cat and dog owners. The app keeps AI chat as the entry point, but the core product is now pet profiles, health logs, care reminders, feeding plans, vet visit preparation, files, and product/service decision workflows.

## MVP Modules

- Pet Profiles: multi-pet profiles with species, breed, gender, birthday/age, weight, sterilization, allergies, medical history, vaccination, deworming, food preferences, and avatar.
- Health Logs: appetite, water, poop, vomiting, energy, mood, weight, symptoms, medication, abnormal behavior, and notes.
- Feeding & Care Plan: local plan generation plus AI refinement using the selected pet profile and recent logs.
- Vet Visit Assistant: symptom/log summaries, pre-vet checklist, vet questions, report/document explanation, and medical safety wording.
- Product & Service Assistant: pet food, wet food, litter, deworming, grooming, insurance, smart feeders, toys, carriers, and local service comparisons.
- Pet Dashboard: desktop workspace and mobile bottom navigation with pet cards, tasks, recent logs, reminders, AI suggestions, and quick actions.

## Development

```bash
npm install
npm run dev
```

The Vite frontend and Node backend are served by the development setup. Configure provider API keys as server environment variables when possible:

- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `XAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEEPSEEK_API_KEY`
- `DOUBAO_API_KEY`
- `KIMI_API_KEY`
- `QWEN_API_KEY`

## Verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Production

```bash
npm run build
HOST=0.0.0.0 PORT=8787 node server/index.mjs
```

Docker deployment:

```bash
docker compose up --build -d
```

## Data Storage

The app now targets a production-ready storage split while keeping SQLite available for local development:

| Data                             | Location                          | Format                |
| -------------------------------- | --------------------------------- | --------------------- |
| Chat sessions & messages         | PostgreSQL via `APP_DATABASE_URL` | Relational tables     |
| Pet profiles                     | PostgreSQL via `APP_DATABASE_URL` | User-scoped rows      |
| Health logs                      | PostgreSQL via `APP_DATABASE_URL` | User-scoped rows      |
| Care reminders                   | PostgreSQL via `APP_DATABASE_URL` | User-scoped rows      |
| Care plans                       | PostgreSQL via `APP_DATABASE_URL` | User-scoped rows      |
| Short-lived auth/rate-limit data | Redis via `REDIS_URL`             | TTL keys              |
| Uploaded images/files            | S3-compatible object storage      | Bucket objects        |
| User settings & provider config  | PostgreSQL + browser storage      | JSON/rows             |
| Imported files/projects          | `data/projects/`                  | JSON chunks and files |

Local development can leave `APP_DATABASE_URL` empty to use `data/app.sqlite`. Docker Compose starts PostgreSQL, Redis, and MinIO by default.

## Medical Safety

Pet AI Manager is not a veterinary diagnosis or prescription system. It can help owners organize observations, prepare questions, and understand documents in plain language. Severe or persistent symptoms should be handled by a licensed veterinarian or emergency clinic.
