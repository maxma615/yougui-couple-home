# Task 7 备份与恢复验收记录

日期：2026-09-23  
环境：macOS 开发机、Node.js 26.9.0、PostgreSQL 客户端/服务端 18.6、本地隔离 `ch_` 测试数据库。

## 已验证

- 一致备份取得独占写维护锁，并同时取得迁移锁；并行应用写事务和照片清理事务在锁释放前保持等待。
- `pg_dump` 生成 custom archive；有效照片、仍存在的合法待清理文件进入载荷，队列中文件已删除的状态进入清单。
- 备份先写 `<backupId>.partial`，成功后带 `COMPLETE` 原子改名；存储校验失败或其他异常不会生成完成目录。
- 写入和读取共享 64 MiB 清单上限；超过旧 1 MiB 的合法清单可校验，超过统一上限会在完成标记前拒绝。
- 恢复只接受空数据库和空附件目录。数据库 archive、照片和清单在写目标前全部校验字节数与 SHA-256；符号链接和额外/缺失文件被拒绝。
- 空目标恢复保留两位账号、纪念日、待办、点滴、JPEG/PNG 和清理队列状态；有效照片摘要一致，未知孤儿/断裂引用/摘要不符均为零。
- 成功恢复撤销旧会话并使未消费邀请过期，旧 Cookie/邀请失效；原密码可重新登录。
- 目标写入后的恢复失败保留 `.restore-in-progress` 且写明 `state: failed`，供启动保护拒绝半恢复环境。
- Compose 脚本会记录并恢复原先运行的 Web、照片清理和 Caddy 服务状态，并在维护命令前确认只剩数据库服务。

## 实际命令与结果

```text
$ npm test -- tests/integration/backup-restore.test.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
$ bash tests/scripts/run-empty-restore.sh
Test Files  1 passed (1)
Tests       1 passed | 9 skipped (10)
```

```text
$ npm run typecheck
tsc --noEmit
exit 0
```

```text
$ sh -n scripts/backup.sh
$ sh -n scripts/restore.sh
$ sh -n tests/scripts/run-empty-restore.sh
exit 0
```

以上恢复测试实际调用 PostgreSQL 18.6 `pg_dump`/`pg_restore`，每次创建新的源/目标数据库和附件目录，并在结束后清理。

## Task 9 M2 日历备份增量验证

- 真实源库新增一条 `2026-10-30` 至 `2026-11-02` 的跨月全天事件，并由另一位成员更新到 version 2；空库恢复后起止日期、版本、创建成员和更新成员均与源库一致。
- 真实源库新增一条由 DST 回拨偏移输入生成的带时刻事件：`2026-11-01T01:30:00-04:00` 至 `2026-11-01T01:30:00-05:00`；空库恢复后仍规范化为 `2026-11-01T05:30:00.000Z` 至 `2026-11-01T06:30:00.000Z`。
- 恢复后的两类日历 DTO 与源库逐字段一致，`calendar_events` 数量与源库一致；该检查与账号、M1 记录、照片、清理队列、会话及邀请失效检查在同一个真实空目标恢复用例中执行。
- 测试先在日历服务尚未落地时以缺少 `src/modules/calendar/service` 失败；0005 迁移与服务实现完成后，同一测试转为通过。

```text
$ npm test -- tests/integration/backup-restore.test.ts
Test Files  1 passed (1)
Tests       10 passed (10)
```

```text
$ bash tests/scripts/run-empty-restore.sh
Test Files  1 passed (1)
Tests       1 passed | 9 skipped (10)
```

```text
$ sh -n tests/scripts/run-empty-restore.sh
exit 0
```

## 尚未验证的部署项

本机没有 Docker 命令，因此没有执行 Compose 镜像构建、容器内 PostgreSQL 客户端检查、真实容器卷恢复，以及成功/失败场景下的容器服务停启验收。`compose.yml` 已统一为 PostgreSQL 18，并按 18+ 官方镜像要求把数据卷挂到 `/var/lib/postgresql`；应用/maintenance 镜像基于 `postgres:18` 并复制 Node 24 runtime，避免隐式依赖宿主机 PostgreSQL 客户端。这些内容需要在安装 Docker 的 Linux 部署环境按运维手册复验，当前不标记为 Docker 已验收。
