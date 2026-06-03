# 宠物 AI 管家 (Pet AI Manager) - 项目现状总结

## 1. 项目简介

**宠物 AI 管家** 是一款专为猫狗主人设计的、由 AI 驱动的宠物家庭管理工作区。项目以 AI 对话作为核心交互入口，深度整合了宠物档案管理、健康日志记录、日常护理提醒、喂养计划生成、就医准备辅助以及宠物产品/服务决策等功能，旨在为用户提供全方位的宠物养育智能助手。

## 2. 技术栈架构

### 前端 (Frontend)

- **核心框架**: Vue 3 (Composition API) + Vite
- **状态管理**: Pinia (`src/stores/auth.ts`, `src/stores/chat.ts`)
- **路由管理**: Vue Router (`src/router.ts`)
- **UI 库/组件**: Element Plus Icons, 自定义 CSS (`src/styles.css`)
- **其他工具**: DOMPurify (防 XSS), Marked (Markdown 渲染), html2canvas/jspdf (导出功能), Monaco Editor (提示词实验室)。

### 后端 (Backend)

- **运行环境**: Node.js (基于原生 HTTP 模块构建的自定义 Server, `server/index.mjs`)
- **数据库**:
  - **PostgreSQL**: 生产环境主数据库（存储聊天会话、宠物档案、健康日志等）。
  - **SQLite**: 本地开发环境的轻量级替代方案 (`data/app.sqlite`)。
- **缓存与临时存储**: Redis (用于 Auth 验证码、速率限制等短生命周期数据)。
- **对象存储**: S3 兼容存储 (如 MinIO，用于存储用户上传的图片和文件)。

### AI 与大模型 (AI & LLM)

- **多模型网关**: 支持一键接入 OpenAI, Gemini, Anthropic, DeepSeek, Kimi, 豆包, Qwen 等多种主流大模型 (`src/ai/petExpert/gateway.mjs`)。
- **AI 编排层**: 实现了完整的 RAG (检索增强生成) 和 Agent 工具调用逻辑。

## 3. 核心功能模块与目录结构

### 3.1 用户认证模块 (`src/components/auth/`)

- **功能**: 支持手机号验证码注册/登录、密码登录。
- **UI 特色**: 包含精美的视频背景 (`VideoBackground.vue`) 和欢迎页面 (`LoginWelcome.vue`)。
- **后端支持**: `server/auth.mjs` 处理 OAuth、短信验证码、账号密码校验等逻辑。

### 3.2 宠物档案与主页 (`src/components/pet/`)

- **主页视图**: `HomePage.vue` 是用户登录后的核心看板。
- **多端适配**: 桌面端侧边栏 (`DesktopSidebar.vue`) 与移动端底部导航 (`MobileTabBar.vue`)。
- **日常打卡**: 包含宠物日常打卡界面 (`DailyCheckInScreen.vue`) 和吉祥物互动 (`CheckInMascot.vue`)，逻辑由 `useDailyCheckIn.ts` 驱动。
- **多宠物管理**: 支持多只宠物档案的快速切换 (`PetSwitcher.vue`)。

### 3.3 AI 对话与专家系统 (`src/views/ChatView.vue`, `src/components/chat/`)

- **对话界面**: 包含消息气泡 (`MessageBubble.vue`)、代码/文本块渲染 (`CodeBlock.vue`)。
- **高级面板**:
  - `PlanPanel.vue`: 展示 AI 生成的护理/喂养计划。
  - `PromptLabPanel.vue`: 供开发者或高级用户调试 Prompt 的实验室。
  - `ToolCallLogs.vue`: 透明展示 AI 调用底层工具的过程日志。
- **AI 专家大脑 (`src/ai/petExpert/`)**:
  - `router.mjs` / `orchestrator.mjs`: 意图识别与任务路由编排。
  - `retriever.mjs` / `contextBuilder.mjs`: 知识库检索与上下文构建。
  - `prompts.mjs` / `outputSchemas.mjs`: 核心提示词与结构化输出定义。
  - `safetyRules.mjs`: 医疗安全底线规则（强调 AI 不替代兽医诊断）。

### 3.4 静态领域知识库 (`knowledge/pet-care/`)

内置了丰富的 Markdown 格式专业宠物护理知识，供 RAG 检索使用：

- `common-symptoms.md` (常见症状)
- `deworming.md` (驱虫指南)
- `emergency-red-flags.md` (紧急就医红旗指标)
- `nutrition.md` (营养学)
- `product-comparison.md` (产品对比)
- `report-explanation.md` (体检报告解读)
- `vaccination.md` (疫苗接种)

## 4. 运行与部署状态

- **本地开发**: 运行 `npm run dev` 即可同时启动 Vite 前端和 Node 后端。支持无缝回退到 SQLite 以降低本地开发依赖。
- **生产部署**: 根目录下提供了 `docker-compose.yml`，支持一键拉起 PostgreSQL, Redis, MinIO 等基础设施，具备完整的生产环境部署能力。
- **代码规范**: 配置了 ESLint, Prettier, Husky 和 lint-staged，确保代码提交质量。

## 5. 项目当前阶段评估

项目目前已经具备了非常完整的 MVP（最小可行性产品）形态。前端 UI 丰富且区分了移动端/桌面端交互；后端存储架构设计合理，具备向生产环境扩展的能力（Postgres + Redis + S3）；AI 核心逻辑分层清晰，不仅有对话能力，还结合了具体的业务场景（打卡、计划生成、知识检索）。整体代码结构健康，处于可以持续迭代业务功能的高效开发期。

## Mobile App UI Quality Skill

When working on this repository, always apply `docs/skills/mobile-app-ui-quality.md` whenever the task involves mobile app frontend UI.

This includes:

- creating UI
- editing UI
- refactoring UI
- reviewing UI
- improving mobile layout
- home page
- login or onboarding
- AI chat page
- bottom tab navigation
- cards
- forms
- lists
- modals
- pet care screens
- pet AI assistant screens

The goal is to make the app feel like a polished, production-ready iOS/Android mobile app, not a desktop webpage squeezed into a phone screen.

Before returning code for any mobile UI task, inspect the relevant layout/components/styles, reuse or centralize design tokens, check 360px mobile width, safe areas, touch targets, state handling, accessibility, and provide the final response format required by the skill.
