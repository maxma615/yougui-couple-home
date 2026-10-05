# 上海 ECS 发布记录

发布日期：2026-10-05。用户已授权将情侣空间部署到已购服务器，并确认没有域名；通过自己的 Chrome 登录控制台，单独确认后新增了网站的 TCP 80/443 入站规则。

## 访问和账号

- 正式地址：<https://8.133.186.15>。HTTP 自动转 HTTPS；Caddy `default_sni` 解决 IP 客户端不发送 SNI、ECS NAT 隐藏公网监听地址的问题。
- 原首位成员 `admin@couple.local` 已按本次授权绑定手机号并更新为用户指定密码，身份 ID 和原有空间保留；对象手机号账号已加入该空间第二位置。两位成员直接通过手机号密码登录，不开放公共注册。
- 独立管理员登录 `/admin`，不占双人成员位置。面板支持创建成员、绑定空位置、密码重置和启停账号；管理员角色不能读取私人空间内容。账号凭据通过受保护标准输入配置，不写入文档。
- 生产 IP 证书由 Let's Encrypt 签发，SAN 含 `8.133.186.15`，当前证书有效期为 2026-10-05 06:43:42 UTC 至 2026-10-11 22:43:41 UTC。Caddy 自动维护 shortlived 证书，证书和 ACME 账号写入持久化卷。

## 运行配置

实例 `i-uf6i9ie15g82dprialoy`，区域 `cn-shanghai`，Ubuntu 24.04 amd64，2 vCPU/2 GiB、40 GB 系统盘、3 Mbps 公网带宽。安装 Docker 29.1.3、Compose 2.40.3，新增独立 2 GiB swap。

- 代码：`/srv/yougui/releases/81ab435`；`/srv/yougui/current` 指向该版本目录。源提交 `81ab435`，跟踪文件已逐一核对；管理员与手机号增量验收见 `docs/admin-phone-acceptance.md`。
- 配置：`/srv/yougui/config/production.env`，属主 root、权限 0600；代码目录 `.env` 只是该文件的符号链接，构建时排除环境文件。
- 固定项目名：`COMPOSE_PROJECT_NAME=yougui`。`compose.override.yml` 指向 `deploy/compose.ip.yml`，备份脚本和普通 Compose 命令使用相同卷。
- 应用、照片清理、维护镜像：`yougui-app:81ab435-ecs`，UID/GID 10001。附件仅保存在 `yougui_attachments_data`。
- 数据库：PostgreSQL 18，卷 `yougui_database_data`，不向公网发布 5432。
- 网关：`yougui-caddy:2.11.7`，卷 `yougui_caddy_data` / `yougui_caddy_config`；镜像显式设置 XDG 存储位置。
- 所有服务采用最多 3 个、每个 10 MB 的日志轮转。常驻服务 `restart: unless-stopped`。

Docker Hub 在本机房连接超时，Node/PostgreSQL 使用 AWS ECR 的 Docker 官方镜像缓存并打本地标签。Caddy 使用官方 GitHub Linux amd64 发布文件，按官方 SHA512 清单验证；归档 SHA256 为 `727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b`。自制 Caddy 镜像复用 PostgreSQL Debian 层，并复制新 Ubuntu 主机官方 `ca-certificates` 的根证书集合；`/usr/local/share/ca-certificates` 无额外根证书。不得禁用 TLS 校验。

## 验证记录

- 在空数据库和空附件卷内恢复本地一致性备份；存储检查没有未知文件、断裂引用或哈希错误。
- 迁移前后 10 张表的行数和规范化行 SHA256 完全相同，包括用户密码哈希、成员、空间版本、日历、照片元数据与迁移校验。
- 实例上以 UID 10001 执行 50 项目标测试：备份恢复、会话/邀请竞争、照片生命周期与照片权限通过。第一次照片 API 用例因测试 Origin 仍使用公网配置返回 403；在独立测试进程指定其固定 localhost Origin 后，3 项用例通过。
- Linux 生产进程重启测试保留四类业务资源、两种日历事件、会话、版本和审计成员；重新登录后 JPEG/PNG/WebP 均保持原 SHA256。测试仅创建独立临时数据库和资料目录，不写入真实空间。
- 公网 curl 默认校验证书，HTTPS `/api/health` 返回 200；用户 Chrome 正常显示登录页，HTTP 返回 308 跳转。没有浏览器证书警告绕过。
- 通过五分钟自动过期的管理验收会话读取迁移账号；未登录照片/SSE 请求返回 401，跨源写入返回 403。两条接受压缩的公网 HTTP/2 SSE 连接及时收到数据，持续 70 秒、各收到至少四次心跳，未被代理缓冲或断开。会话随后主动撤销，未改变密码或真实业务记录。
- 生产镜像扫描 318 个构建文件，没有配置凭据或附件路径；`npm audit --omit=dev` 报告 0 个漏洞。维护后四项常驻服务正常，数据库 healthy，主机可用内存约 1 GiB、系统盘剩余约 30 GB。

初次发布时真实空间只有一位成员、没有历史照片；照片写入与恢复使用独立测试资料验证。随后本次授权的账号增量发布创建了第二位成员和独立管理员；三个正式密码登录与权限矩阵、应用重启后配对保留均已实际验证。真实安卓设备的输入法、性能和添加到桌面仍需设备验收。

## 备份与维护

每日上海时间 03:00（随机延迟最多 5 分钟）由 `yougui-backup.timer` 执行一致性备份，结果写 `/srv/yougui/backups/automatic`。已实际启动服务并成功完成一次备份，应用、照片清理和 Caddy 在备份后自动恢复。备份期间短暂停服；照片越多，时间越长。当前不自动删除历史备份，维护时检查磁盘容量，并将完成备份复制到站外。

本机站外备份目录为 `~/Library/Application Support/Yougui/Backups/ECS`，权限 0700，真实资料不提交到代码仓库。`cloud-20261005.tar.gz` 保存完整备份 `20261005T074910Z-ecfb44b83371`；下载后完成标记、清单和数据库文件 SHA256 均验证通过，归档 SHA256 为 `8beca3e40051030b56e10b797203833cf7c5d6265d936347442fe1b9fdd0303b`。

账号增量升级后备份 `20261005T145924Z-7b27f9212d06` 另存为 `post-admin-20261005.tar.gz`，服务器和本机归档 SHA256 一致：`61d6bb53410e46b9399fbe1cbee59241864ad8be01c367f2357d2e10c2fe902d`。该副本包含新角色、手机号登录与两位成员关系，权限 0600。

```sh
cd /srv/yougui/current
docker compose ps
docker compose logs --tail 100 app photo-cleanup caddy
docker compose exec -T app npm run verify-storage
systemctl start yougui-backup.service
systemctl list-timers yougui-backup.timer
```

恢复只接受空数据库和空附件目录。先建立新 Compose 项目/空卷、配置不同项目名；让 UID 10001 可读取完整备份树，再按 `docs/operations.md` 执行恢复。禁止对当前卷直接清库或运行 `docker compose down -v`。

成员忘记密码可由独立管理员在面板中重置，操作会撤销成员既有会话。管理员本人在面板“修改我的密码”弹窗输入当前密码与新密码；服务器紧急重置仍需用户明确授权，并使用 CLI 交互标准输入，禁止把密码放入命令历史或文档。购买域名后改配置和对应网关文件，并按新 Origin 重新验收。

## 2026-10-06 日本麻将增量发布

当前发布目录改为 `/srv/yougui/releases/d5418f2`，应用/照片清理镜像 `yougui-app:d5418f2-ecs`；`current` 与受保护配置已原子切换，原数据卷与密码保留。麻将为应用容器内按需启动的子进程，3100 不发布到公网，Caddy 仅转发同源 Socket.IO 路径。用户入口 <https://8.133.186.15/mahjong>。实际测试、真实备份恢复、内存与站外副本证据见 [麻将验收](riichi-acceptance.md)。每日备份停机会结束未持久化的麻将牌局；生活资料仍按原机制保存。

## 2026-10-06 三麻与电脑补位发布前资源准备

候选源码 `3735cad` 已在 Linux Node 24、独立数据环境中完成网站与完整三/四麻联合资源测量，并从每日一致备份实际恢复 28 张真实照片及原账号。`deploy/compose.ip.yml` 为应用增加 1 CPU、768 MiB 内存及相同总内存交换限额（容器不使用 swap）；Compose 解析与实际同限额容器验证通过。此配置尚未应用到公开网站，当前保护版本仍为 `48005f6`。具体指标、备份和发布边界见 [三麻电脑验收](sanma-bots-acceptance.md)。仅应用服务属于本次发布；保留现有照片清理容器 `73898b7-ecs`，未来单独重建前须明确它的镜像选择。

三麻发布工具复审后增加临时全站 503 屏障和仅暂停 Next 的检查阶段，避免“检查时空桌、备份前又有人创建”竞态。网关屏障覆盖实际挂载 inode、当前配置路径及未来发布路径，跨 Caddy 停启和 `current` 切换保持；所有权不匹配时拒绝撤销。Next 与麻将分开识别，只有已排空内部 HTTP 和数据库工作、确认无真实牌桌后才能停止应用。检查失败则恢复同一 Next；停止旧应用之后的失败会重新启动原版本并检查健康，再撤销屏障。工具没有在真实网站执行，使用前仍需新的发布前复审。
