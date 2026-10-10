# 换设备开发交接

更新：2026-10-10。仓库根目录就是应用目录，克隆后不需要再进入 `couple-home/`。主分支包含现有网站、管理员、三/四人日本麻将、电脑补位、原创建模和授权素材、测试及部署配置。线上运行代码为 `7d5daf5`；后续交接文档提交不改变运行代码。

## 从空设备开始

准备 Node.js 24+、npm、Git 和 PostgreSQL 18。`argon2`、`sharp` 为原生依赖，使用锁文件安装对应平台包；不要从旧电脑复制 `node_modules`。需要恢复验证时还须同主版本的 `pg_dump` / `pg_restore`。旧的 `scripts/pg-start` 依赖本机 `.local/postgres` 二进制，新电脑不会自动安装这个目录；已有数据库或下列 Docker 方式均可。

```sh
git clone https://github.com/maxma615/yougui-couple-home.git
cd yougui-couple-home
npm ci --cache .local/npm-cache
cp .env.example .env.local
```

在 `.env.local` 配置独立开发数据库 `DATABASE_URL`、`APP_ORIGIN=http://127.0.0.1:3000`、本机绝对路径 `ATTACHMENTS_DIR`、随机且至少 32 字符的 `SESSION_SECRET`。可用 `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` 生成密钥。创建附件目录。Windows 使用自己的绝对路径，例如 `C:/yougui-data/attachments`；目标系统需实际验收，不沿用 Mac 路径。

如果安装了 Docker，可用下列命令启动单独的开发数据库。先在 `.env` 填入独立开发用 `POSTGRES_PASSWORD`；示例使用 55432，端口已占用时另选空闲端口。

```sh
cp .env.compose.example .env
# 编辑 .env 的 POSTGRES_PASSWORD 后运行；不要使用生产密码。
docker run -d --name yougui-dev-db --env-file .env -e POSTGRES_USER=couple_home -e POSTGRES_DB=couple_home -p 127.0.0.1:55432:5432 -v yougui_dev_pg:/var/lib/postgresql postgres:18
```

令 `.env.local` 的 `DATABASE_URL` 指向 `postgresql://couple_home:你的开发密码@127.0.0.1:55432/couple_home`。密码若含 URL 保留字符须编码；随机十六进制密码可以避免此问题。等待数据库就绪后运行（已有本机 PostgreSQL 时直接使用自己的空开发库）：

```sh
npm run migrate
npm run init-admin -- --email developer@example.com --display-name 开发成员
npm run dev
```

按终端提示输入 12–128 字符的密码。`init-admin` 是历史命名，实际创建首位普通成员，并非独立管理员。打开 `http://127.0.0.1:3000`，登录后创建空间；第二人通过邀请加入。没有公开注册入口。

需本地复现手机号和独立管理员时，先创建首位成员和空间，再通过 `npm run provision-accounts` 的标准输入提供 JSON。字段结构是：`existingOwnerEmail`、`first: {phone,password}`、`second: {phone,displayName,password}`、`admin: {email,displayName,password}`。用自建测试账号与合成手机号，输入文件放在忽略目录并限制读取权限；不要用生产账号数据。该命令会原子绑定两位成员并创建独立管理员，已有身份冲突会拒绝。实现见 `src/modules/admin/provision.ts`。管理员入口 `/admin`；管理员不占双人空间位置。

## 当前功能与代码入口

| 功能 | 主要位置 |
| --- | --- |
| 邮箱/手机号登录、会话、修改密码、邀请、双人空间 | `src/modules/auth`、`src/modules/home`、`src/app/api` |
| 管理员账号管理与跨空间相册只读 | `src/modules/admin`、`src/app/admin` |
| 首页、纪念日、待办、共同日历、点滴和照片 | `src/app/(home)`、`src/modules`、`src/components/photo-viewer.tsx` |
| 事件同步、并发版本冲突、附件鉴权与清理 | `src/lib/events`、`src/modules/photos`、`src/cli/cleanup-photos.ts` |
| 麻将按需进程、HTTP/Socket、房间与席位 | `src/modules/mahjong/process.ts`、`server.ts`、`rooms.ts`、`src/app/api/mahjong` |
| 四麻规则 / 三麻移除二至八万、拔北与计分 | `src/modules/mahjong/engine.ts`、`sanma.ts`、`sanma-scoring.ts` |
| 三/四人桌电脑补位 | `src/modules/mahjong/bot-runner.ts`、`bot-worker.ts`、`bot-strategy.ts` |
| 实体牌、相机、拖牌、动作选择、宣告、结算 | `src/components/mahjong`、`src/app/mahjong` |
| 开局发牌、宝牌、自动操作、桌布与声音 | `round-opening.ts`、`use-round-opening.ts`、相关麻将组件和 CSS |
| SQL 迁移、部署与运维 | `db/migrations`、`compose.yml`、`Dockerfile`、`deploy`、`docs/operations.md` |
| 素材和许可证 | `public/mahjong`、`public/fonts`、相邻 NOTICE / LICENSE 文件 |

日本麻将入口 `/mahjong`，普通成员登录后可建桌；不同空间的成员可以共同打牌。杭州和四川麻将未实现。麻将子进程按需启动，牌局只在内存，重启后不恢复；不依赖远端模型服务。网站的账号、生活记录与附件独立持久化。`MAHJONG_PORT` 默认 3100，是内部端口；外部通过网站代理 Socket.IO，不需要直接开放 3100。

## 验证与开发顺序

先读 `AGENTS.md`，再读当前功能的验收和设计文档。修改 Next.js 代码前阅读安装包 `node_modules/next/dist/docs/` 对应指南。迁移新增文件，不回写已应用迁移。所有本机日志、测试数据和构建放在本应用目录的忽略路径。

```sh
npm test
npm run typecheck
npm run build
npm run check:secrets
# 浏览器安装路径与测试脚本一致：
PLAYWRIGHT_BROWSERS_PATH=.local/browsers npx playwright install chromium webkit
npm run test:e2e
```

Windows PowerShell 设置浏览器路径用 `$env:PLAYWRIGHT_BROWSERS_PATH='.local/browsers'`，再运行安装命令。部分 Bash 运维脚本需 WSL/Linux 或 macOS。数据库测试通过 `tests/helpers/database.ts` 创建随机 `ch_*` 数据库，因此开发 PostgreSQL 账号需要创建/删除测试库权限；不要指向生产。浏览器 E2E 自动选择独立端口、数据库和附件目录。`tests/browser/*.tsx` 是独立原生视觉/联机脚本，**不由 `npm test` 自动执行**；例如：

```sh
PLAYWRIGHT_BROWSERS_PATH=.local/browsers npx tsx tests/browser/mahjong-round-opening-network.tsx
```

这些脚本生成 `.local/audit` 的测量与截图；它们使用本机适配，不替代生产认证 WSS 或真实安卓验收。受硬件渲染影响的 3D 投影要结合实际 GPU 浏览器检查。

最新完整运行代码检查为 1215 项 / 105 文件、248 原生浏览器及联机场景、类型/构建/秘密扫描；同镜像 ECS Linux 800 项 / 49 文件。详见 [材质与落位发布](mahjong-deal-arrival-acceptance.md)。这是既有版本证据，换设备后仍应按所改范围复跑。当前源码完整程度和待办见 [麻将进度](mahjong-fidelity-progress.md)。首局声音手势授权已修复并发布，见 [本轮验收](mahjong-lobby-audio-acceptance.md)。优先未完成项包括真实 Android、完整世界尺度与入场呈现、开局桌布双击末张语义、生产认证 WSS 故障场景；不要把目标写成已经全部完成。

## 生产环境与提交约定

当前私有使用实例是 `https://8.133.186.15`，上海 ECS；部署方式与 IP 证书见 [ECS 记录](ecs-deployment.md) 和 `deploy/compose.ip.yml`。通用域名部署见 [运维手册](operations.md)。不要在另一台电脑自动初始化、迁移或重启生产。

当前用户明确关闭备份：保留 `/srv/yougui/config/backups-disabled`，不启用定时器、不执行自动备份、不下载真实资料。以 [最新禁备份约定](2026-10-07-backups-disabled.md) 和 `AGENTS.md` 为准；旧记录中的备份流程是历史能力，不能当成当前执行授权。

仓库保存代码、锁文件、迁移、测试、素材及说明。数据库、照片、密码、会话、环境文件、构建产物、本机数据库二进制和 `.local` 临时发布/验证日志不随源码交接；接手本地开发可创建合成数据，无需访问生产资料。远端发布的临时命令和本机证明路径是历史审计引用，不是应用启动依赖。

每次完成并验证后 commit，立即普通推送工作分支；主分支可快进时同时更新 `main` 并核对远端 SHA。远端有新提交先获取并整合，不强推。源码主分支是接手入口；网站运行版本以发布验收记录为准，文档提交不等于再次部署。

## 本次交接复核

2026-10-09 从 GitHub `main` 的 `c7123f7` 重新克隆到独立忽略目录，没有复用原工作目录的依赖、环境文件或构建。全新 `npm ci` 完成，`npm run typecheck`、`npm run build` 和 `npm run check:secrets` 均实际退出 0。这验证当前锁文件和公开源码可在本机重装并构建；本轮未重新执行整套数据库/浏览器验收，也未代表另一台设备或 Windows 已验收。

同时逐文件核对本机主应用目录与已提交发布工作树：没有遗漏的 `src/`、`public/`、`tests/`、迁移、依赖锁文件或生产部署功能代码。两者的差异主要为旧说明、历史截图、本机生成的类型配置与未采用的域名草稿，当前接手以主分支和本指南为准。私人数据与临时日志保持排除。


## 开局桌布双击视觉末张候选（2026-10-10）

理牌后的桌布双击现从实际渲染 rack 选视觉末张，保留真实摸牌及合法 Choice 身份。1221／105 完整检查和208原生场景通过，候选尚未发布；当前 ECS 仍 d4aac3d。参考开局摸切标记语义与完整当前厂商体验继续待核对，见[验收](mahjong-opening-last-shortcut-acceptance.md)。


## 开局桌布视觉末张已发布（2026-10-10）

7d5daf5／Build H9qssq6w2xCRo_MZRd3qr 已上线，1221／105完整检查、208原生场景、最终镜像受限Linux806／49、744源码／449构建、公网145资源及13阶段终态通过；12表摘要、资源、清理器和禁备份保持。参考开局摸切标记／自动操作、实际GPU／Android与生产认证WSS及完整当前厂商体验仍待核对，见[发布验收](mahjong-opening-last-shortcut-acceptance.md)。


## 开局自动摸切候选（2026-10-10）

候选统一实际渲染rack末张与自动弃牌，保留真实摸牌身份、合法Choice及特殊操作优先级。1235／105完整、304原生场景、类型／构建／374扫描通过，本机Linux选择820／49；ECS仍7d5daf5，候选同镜像／发布待验。见[验收](mahjong-opening-auto-acceptance.md)。
