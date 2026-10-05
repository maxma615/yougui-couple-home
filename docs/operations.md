# 情侣空间运维手册

本文适用于 M1 的单机 Docker Compose 部署和本地维护。数据库与附件必须作为一个备份单元处理；不能只复制 PostgreSQL 或只复制照片目录。

上海 ECS 的已上线配置、IP HTTPS 和每日备份见 [ECS 发布记录](ecs-deployment.md)。应用和维护容器以 UID/GID `10001:10001` 运行；新的附件卷会从镜像继承正确属主。已有附件卷或外置备份目录须在维护停服时由管理员确认其属主和访问权限。

## 运行前配置

在目标部署主机将 `.env.compose.example` 复制为 `.env`，生产环境至少配置以下值：

- `POSTGRES_PASSWORD`：数据库专用的64字符随机十六进制密码。Compose将它嵌入连接URL，十六进制可避免未编码的URL保留字符导致连接失败。
- `SESSION_SECRET`：至少 32 字符的独立随机值，不与数据库密码复用。
- `APP_DOMAIN`：已解析到服务器的域名。
- `APP_ORIGIN=https://<域名>`：必须与浏览器实际访问地址一致。
- `MAX_UPLOAD_BYTES`、`MAX_IMAGE_PIXELS`：可选的照片上限。

可分别执行两次 `node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'` 生成数据库密码与会话密钥，填入各自变量。不要复用示例值或把真实环境文件提交到版本库。

Caddy 负责申请和续期 HTTPS 证书。公网部署前确认 80/443 端口、DNS、服务器防火墙和站外备份目的地均已准备好。密码和令牌只写入服务器上的环境文件或秘密管理系统；不要提交到代码仓库、备份清单或工单。

Compose 使用 PostgreSQL 18。18 及以上官方镜像把数据根目录改为 `/var/lib/postgresql`，命名卷已挂载到这一新位置。应用镜像也包含同主版本的 `pg_dump` 和 `pg_restore`，不依赖宿主机预装 PostgreSQL 客户端。

## 日常启动和检查

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 app db caddy
```

应用启动前会运行迁移。附件目录存在 `.restore-in-progress` 时，运行时配置校验会拒绝启动，避免半恢复数据库对外服务。不要为绕过启动保护而手工删除这个文件。

本地开发可运行：

```sh
npm run pg:start
npm run migrate
npm run dev
npm run verify-storage
```

`verify-storage` 分别报告：有效照片、合法待清理项、未知孤儿、断裂引用和摘要不符。待清理项的文件可能已经删除、数据库队列尚未来得及提交；这种状态仍是合法的，并以 `exists: false` 明确显示。

## 一致备份

生产 Compose 备份：

```sh
mkdir -p /srv/couple-home-backups
chown 10001:10001 /srv/couple-home-backups
chmod 750 /srv/couple-home-backups
./scripts/backup.sh /srv/couple-home-backups
```

脚本记录原先正在运行的 `app`、`photo-cleanup`（如已配置）和 `caddy`，停止这些服务并确认没有其他非数据库服务运行，然后在 maintenance 容器中备份。无论成功或失败，脚本都会尝试恢复原来的服务状态。停服时间包含数据库导出与照片复制，主要随数据库和照片总量增长；首次正式使用前应以实际数据量计时。

从其他机器复制来的备份需让 UID `10001` 能遍历备份根目录及其子目录，并读取其中的 `0600` 文件；仅修改外层目录属主不够。管理员应只对选定的备份树执行递归属主调整，保留文件 `0600`、目录 `0750` 或更严格的权限。生产环境文件必须使用固定 `COMPOSE_PROJECT_NAME`，这样日常命令和备份/恢复脚本会选择同一组容器与卷。

本地维护命令不负责停进程，但仍获取独占写维护锁和迁移锁：

```sh
npm run backup -- /absolute/path/to/backups
```

备份流程等待正在执行的写事务和照片清理结束，并阻止新写、清理和迁移进入；随后生成包含日历在内的全部业务表的 PostgreSQL custom archive，复制 `photos/` 下的受控文件并写清单。发现未知孤儿、断裂引用或哈希不一致时直接失败。

清单上限统一为 64 MiB；写入端在生成 `COMPLETE` 前检查，恢复端在读取 JSON 前检查文件大小。这个上限可容纳数十万条照片清单项；超过上限时备份失败且不会生成可用完成目录。

成功目录格式为：

```text
YYYYMMDDTHHMMSSZ-<12位随机十六进制>/
  database.dump
  photos/<随机存储名>
  manifest.json
  COMPLETE
```

工作目录先使用同级 `<backupId>.partial`，全部完成后才原子改名。只有同时存在 `manifest.json` 和内容匹配的 `COMPLETE` 才是完成备份。失败会删除 partial 目录，不留下完成标记。清单记录模式迁移、每个载荷文件的相对路径、状态、字节数和 SHA-256；不记录明文密码、Cookie、邀请令牌或服务器附件绝对路径。

备份包含私人记录、照片和密码摘要，应限制为管理员可读，并在站外存储中启用静态加密。每次备份完成后，把整个完成目录复制到服务器之外，并保留文件名和权限。例如复制到已单独授权的备份主机或对象存储。建议至少保留最近 7 个每日备份和 4 个每周备份，并按存储容量调整。删除旧备份前先确认一个较新的站外副本完成过空环境恢复演练。

以下操作前必须额外备份：升级应用/数据库、调整卷、迁移服务器、大批量删除内容和修改备份流程。

## 只向空目标恢复

恢复命令拒绝任何已有业务表（包括 `schema_migrations`）的数据库，也拒绝含任何文件的附件目录。它不会覆盖、合并或清空现有数据。

恢复前会严格校验备份目录名、清单、完成标记、允许的相对文件名、文件类型、字节数和所有 SHA-256，并拒绝符号链接、路径穿越、缺失文件和额外文件。所有校验通过后才创建 `.restore-in-progress` 并写目标。

灾难恢复应使用新服务器或新卷。不要在仍有唯一数据副本的环境执行卷删除。典型步骤：

1. 保留故障环境和最近备份的只读副本。
2. 准备全新的空 PostgreSQL 数据卷和空附件卷，只启动 `db`。
3. 将一个完成备份目录放在宿主机可读路径。
4. 运行 `./scripts/restore.sh /absolute/path/to/<backupId>`。
5. 成功后运行 `docker compose up -d`，再执行 `npm run verify-storage` 或 maintenance 容器内的同一命令。
6. 两位成员用原密码重新登录，抽查纪念日、待办、点滴、照片和日历；日历至少检查一条跨月全天事件与一条带时刻事件，确认全天起止日期、带时刻事件的真实时刻、版本和创建/更新成员均与源环境一致。

恢复使用 `pg_restore --single-transaction --exit-on-error`，随后运行当前迁移，校验每个小屋最多两位成员、关键外键关系和数据库/附件双向一致性。成功恢复会删除所有会话，并使未消费邀请立即过期；密码哈希保持不变，所以原密码仍可重新登录。旧 Cookie 和旧邀请链接不会复活。

恢复失败时命令返回非零，`.restore-in-progress` 保留并标记 `state: failed`，应用继续拒绝启动。保留现场日志用于诊断，在另一个全新空数据库和空附件目录重试。不要把失败目标当作可用副本，也不要手工清标记后继续运行。

## 空环境恢复演练

本地演练使用隔离的 `ch_` 数据库和临时附件目录，不读写开发库：

```sh
bash tests/scripts/run-empty-restore.sh
```

演练覆盖两位真实账号、既有业务记录、跨月全天与带 DST 偏移来源的日历事件、JPEG/PNG、存在及已删除文件的合法清理队列、旧 Cookie/邀请失效和原密码登录。恢复后的日历事件会核对数量、规范化 UTC 时刻、版本和审计成员。还应定期运行完整测试：

```sh
npm test -- tests/integration/backup-restore.test.ts
npm run typecheck
```

Compose 恢复演练需在安装 Docker 的部署环境另行执行：记录停服时长，检查成功和故障时原服务状态恢复，并确认失败标记会阻止应用启动。

## 故障判断

- 只有 `.partial`：备份未完成，不能恢复；查命令输出后删除该 partial 目录。
- 没有 `COMPLETE` 或校验失败：备份不可用，换用另一份完成备份。
- 目标非空：选择新数据库/新附件卷，不要追加 `--force` 或手工清空生产目录。
- `.restore-in-progress` 存在：恢复未完成或失败；应用保持停止，在新空目标重试。
- `verify-storage` 有未知孤儿、断裂引用或哈希异常：停止照片写入和清理，保留文件与数据库现场，先查明来源再重新备份。

## 管理员面板与手机号账号

`/admin` 使用独立管理员登录。管理员不占情侣空间名额，可创建手机号成员、重置成员密码、停用/启用账号，以及把未配对成员绑定到已有空间的空位置；成员仍可在首次登录后创建自己的空间。普通成员无法调用管理 API。管理员改自己的密码必须提供当前密码；成员重置和停用会撤销该成员全部会话。

既有成员的邮箱登录继续兼容；新建的手机号成员不需要邮箱。不要修改已应用的旧迁移，执行当前 `npm run migrate` 自动增加手机号、角色和状态字段，既有首位成员仍是 member，不根据账号名称赋予管理权限。

在已有一位首成员和空间的服务器，可用一次性 `provision-accounts` 运维命令保留原身份、绑定首位手机号、加入第二位及建立独立管理员。它只从标准输入接收 JSON，不接收命令行凭据：

```sh
docker compose exec -T app npm run provision-accounts < /srv/yougui/config/bootstrap-accounts.json
```

JSON 结构为 `existingOwnerEmail`、`first: {phone,password}`、`second: {phone,displayName,password}`、`admin: {email,displayName,password}`。实际输入文件应位于源码外，权限 0600，操作完成并验证后删除服务器上的一次性文件。严禁把真实账号或密码写进文档、终端命令参数、源码或公开日志。命令事务内检查原空间第一位置、手机号冲突、第二位置占用和管理员身份；冲突时整体回滚，不提升已有成员或覆盖冲突的管理员账号。重复输入不会增加重复成员或无谓撤销已正确的会话。

忘记手机号成员密码时优先使用管理面板的重置密码弹窗；服务器 CLI `reset-password --email` 继续用于已有邮箱账号和独立管理员的运维恢复。升级前后都应运行一致备份和空目标恢复验收，确认手机号、角色、启用状态、成员位置和密码摘要得到保留。
