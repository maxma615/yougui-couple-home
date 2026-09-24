# Task 1 实施检查点

日期：2026-09-23

## 已交付

- 独立 Next.js 16 + React 19 + TypeScript 工程、锁文件与本地脚本；开发和直接启动默认监听 `127.0.0.1:3000`。
- `loadConfig` 对必需配置、上传限制、附件绝对路径、会话密钥、来源协议和生产公网 HTTPS 做校验。生产允许 `localhost`、`127.0.0.1`、`[::1]` 的 HTTP 本机验证；公网来源必须 HTTPS。异步运行时检查在迁移启动命令中确认生产附件目录已存在且可写，避免构建阶段访问数据库或存储。
- `pg.Pool` 与 Drizzle ORM 导出不在模块载入时连接数据库。`transaction(fn, targetPool?)` 支持测试池注入，并在写事务开始后获取共享 advisory transaction lock `71923001`，供后续一致备份使用。
- `AppError`、统一 JSON 错误响应和不泄露内部错误的兜底响应。
- `users`、`homes`、`home_members`、`sessions` 初始 SQL 与 Drizzle schema。`home_members` 以槽位 `1..2` 检查和 `(home_id, slot)` 唯一约束在数据库层限制每个小屋最多两人。
- SQL 迁移器按文件名排序，不要求编号连续；每个迁移文件独立事务执行，记录 SHA-256 校验和，已应用文件缺失或内容变化时拒绝继续。测试可传入独立 `Pool` 和迁移目录。
- 测试数据库工具为每次测试创建随机 `ch_` 前缀数据库，清理时终止该库连接后删除数据库，不清空开发库。
- 健康接口只返回 `{ "status": "ok" }`；基础页面提供米白/暖粉 token、窄屏单列和可见键盘焦点。
- Dockerfile、PostgreSQL/应用/Caddy Compose 基线和命名持久卷；Caddy 不挂载附件卷。`.gitignore` 和 `.dockerignore` 排除 `.env*`、`.local/`、构建与测试产物。

## 新增的 Task 1 文件

- 工程：`package.json`、`package-lock.json`、`tsconfig.json`、`next-env.d.ts`、`next.config.ts`、`vitest.config.ts`、`drizzle.config.ts`、`.env.example`、`.gitignore`、`.dockerignore`
- 服务基础：`src/lib/config.ts`、`src/lib/db.ts`、`src/lib/errors.ts`、`src/db/schema.ts`、`src/cli/migrate.ts`
- 页面：`src/app/layout.tsx`、`src/app/page.tsx`、`src/app/globals.css`、`src/app/api/health/route.ts`
- 数据与部署：`db/migrations/0000_core.sql`、`Dockerfile`、`compose.yml`、`Caddyfile`
- 测试：`tests/unit/config.test.ts`、`tests/integration/migrations.test.ts`、`tests/helpers/database.ts`

## TDD 证据

- 首次执行目标测试时，两个测试套件因 `@/lib/config` 和 `@/cli/migrate` 不存在而失败。
- 配置边界补测曾以 4 个预期失败固定真实随机 hex、生产 loopback HTTP、非法协议和生产附件卷缺失行为；实现后转绿。
- 注入事务池补测曾因旧实现连接默认库而得到 `relation "users" does not exist`；实现 `targetPool` 注入后，真实验证共享备份锁和异常回滚并转绿。

## 实际验证

运行环境：Node.js `v26.9.0`、npm `12.0.2`、本地 PostgreSQL `18.6`，测试连接为 `postgresql://postgres@127.0.0.1:55432/couple_home`。

| 命令 | 实际结果 |
| --- | --- |
| `npm test -- config.test.ts migrations.test.ts` | 通过；2 个文件、17 个测试全部通过 |
| `npm run migrate` | 通过；对本地真实 PostgreSQL 应用当前迁移 |
| `npm run typecheck` | 通过；TypeScript 无错误 |
| `npm run build` | 通过；Next.js webpack 生产构建、类型检查、静态页面生成均成功 |
| `npm audit --omit=dev` | 通过；0 个已知生产依赖漏洞 |
| 从项目根运行 `test ! -e package.json` | 通过；未创建根包文件 |

## 局限

- 当前机器 PATH 中没有 Docker 或 Docker Compose，因此本轮没有实际构建镜像或启动 Compose；Dockerfile、Compose 和 Caddy 配置只完成静态基线，容器运行仍需在有 Docker 的环境复验。
- Task 1 只建立持久化与健康页基线，没有把后续认证、邀请和业务领域功能算作本任务验收范围。
- 未执行真实公网发布，也未验证域名、证书、服务器权限或站外备份目标。
