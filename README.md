# 有归 · 情侣小屋

有归是两个人共用的私密生活网页：独立账号、一次性邀请、纪念日、共同待办、点滴照片、共同日历、自动更新和版本冲突处理。数据库和照片独立保存，不依赖研笺学术工作台。

日历支持全天跨日事项与按上海时间显示的定时事项，首页会显示近期共同安排。

完整首版本地验收见 [docs/m2-acceptance.md](docs/m2-acceptance.md)：120项单元/集成测试、30项浏览器测试、生产重启和空环境恢复通过。生产部署、备份和恢复见 [docs/operations.md](docs/operations.md)。当前开发机上的 PostgreSQL 运行方式见 [docs/postgres-runtime.md](docs/postgres-runtime.md)。

## 本地运行

要求 Node.js 24 或更新版本、PostgreSQL 18，以及同主版本的 `pg_dump` / `pg_restore`。本机已准备独立的 `.local/postgres`，使用 `npm run pg:start` 启动；数据、日志与附件均位于应用 `.local/` 下。

首次在另一台开发机运行：

1. 在本目录执行 `npm ci --cache .local/npm-cache`。
2. 复制 `.env.example` 为 `.env.local`，填入自己的数据库地址、绝对附件路径和随机会话密钥。可用 `node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'` 生成密钥。
3. 执行 `npm run migrate`，创建空表。
4. 执行 `npm run init-admin -- --email you@example.com --display-name 你的名字`，在终端隐藏输入初始密码。系统已有账号后该命令会拒绝重复初始化。
5. 执行 `npm run dev`，打开 `http://127.0.0.1:3000`，登录后创建小屋并在设置页邀请另一位成员。

`npm run dev` 和 `npm start` 会先执行迁移与附件目录检查。应用启动不会创建人物或演示内容。生产构建使用 `npm run build`，本地生产运行使用 `npm start`。

管理员忘记密码处理：`npm run reset-password -- --email you@example.com`，交互输入新密码后该账号旧会话全部失效。不要把密码写在命令行参数里。

## 验证

```sh
npm test
npm run typecheck
npm run build
npm run check:secrets
npm run check:clean-build
npm run test:persistence
npm run test:e2e
bash tests/scripts/run-empty-restore.sh
```

自动测试创建独立 `ch_` 数据库，结束后清理；附件及测试文件位于 `.local/tests/` 或 `.local/e2e/`。E2E 另起随机本地端口，用真实数据库和浏览器，不使用开发账号。先停止正在运行的 Next 开发服务器，再运行 E2E 或生产构建，避免共用 `.next` 目录。

首次安装浏览器：`PLAYWRIGHT_BROWSERS_PATH=.local/browsers npx playwright install chromium webkit`。E2E 同时使用桌面 Chromium 与 iPhone 尺寸的 WebKit；这不能替代真实手机及部署环境验收。

## 维护命令

```sh
npm run verify-storage
npm run photo-cleanup
npm run backup -- /absolute/path/to/backups
npm run restore -- /absolute/path/to/backups/某个完整备份目录
```

恢复只接受空数据库和空附件目录。生产维护应使用运维手册中的 Compose 停服脚本，并把完成备份另存至服务器外。公开代码仓库不包含数据库、照片或生产凭据；源代码开放也不代表服务已经部署到公网。

## License

本项目源码以 MIT License 发布，详见 [LICENSE](LICENSE)。依赖项和其他第三方内容仍受其各自许可证约束。
