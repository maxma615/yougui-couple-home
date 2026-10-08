# 有归运维补充约定

用户于 2026-10-07 明确要求不再做备份，并澄清不要下载到本机。此前“改存本机”的理解已被撤销。

- ECS 是 `i-uf6i9ie15g82dprialoy`，上海地域；网站为 `https://8.133.186.15`。
- `/srv/yougui/config/backups-disabled` 是持久化策略标记。不要移除这个标记，也不要重新启用 `yougui-backup.timer` 或在发布流程中生成自动备份。
- 不创建本机备份调度，不把真实资料下载到本机。今后确需备份时，以用户新的明确授权为准；旧文档中的每日备份和升级前备份要求已被本次指令覆盖。
- 用户随后明确授权清理 ECS 未使用的构建缓存、旧发布文件、旧镜像与安装包缓存；保留所有运行镜像、当前发布、一个回滚版本及业务数据库和附件卷。不要删除本机原有历史文件或另一应用资料。
- 实际操作与验证见 `docs/2026-10-07-backups-disabled.md`。

## GitHub 提交同步

用户于 2026-10-08 明确要求把每次更新的 commit 推送到自己的仓库。目的地为 `https://github.com/maxma615/yougui-couple-home`。本任务在所属工作分支完成并验证提交后，立即推送该分支并核对远端提交 SHA；当远端 `main` 是该提交的祖先时，同时以普通快进推送更新 `main`，否则先读取新增远端提交，不覆盖他人更新。使用普通非强制推送，不把凭据、私人资料或运行数据加入仓库。其他任务的分支、主目录索引与尚未提交修改不由本任务代为处理。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
