# 有归正式域名

- 正式入口：https://yougui.online
- www.yougui.online 以 308 跳转到正式域名，HTTP 自动转 HTTPS。
- 备案号：浙ICP备2026086028号-1；阿里云备案控制台显示管局审核通过，备案网站名称为“网页分享”。本次不修改备案申请内容。
- 阿里云 DNS 原有 @、www 两条 A 记录指向 8.133.186.15，原来均暂停，现已恢复启用。TTL 10 分钟。
- Caddy 自动申请和续期证书；域名使用普通 ACME 证书，原 IP 保留 shortlived 证书。
- 有归 APP_ORIGIN 改为 https://yougui.online，账号、数据库及附件卷不变。新域名需要重新登录，原 IP 的 Cookie 不会跨域迁移。
- 原 IP 的有归路径跳转正式域名；/riichi 与 /riichi/* 仍转发独立麻将服务，/mahjong 重定向 /riichi/online/，旧麻将 API 和 Socket.IO 返回 410。
- 麻将容器没有重启，仍使用原独立配置与数据卷。

## 运维

正式配置为 deploy/Caddyfile.domain，旧 Caddyfile.domain.pending 不应再用于上线。将正式配置写入当前实际挂载的 Caddyfile，并 reload；不要仅修改 current 符号链接指向的新目录。此次运行容器仍挂载旧发布目录 ccfe04c9d5a4/deploy/Caddyfile.ip，需要通过 inode 与容器中实际内容核对，当前发布目录内的文件也已同步。

发布前核对 docker inspect 的 Compose 文件、镜像和环境配置来源，仅更新有归 app；不要重建数据库或麻将容器。新版本沿用已有 Linux 运行镜像中的依赖，在受限构建容器中生成 Next 产物；不把 .env、账号资料或附件打包到源码中。

遵守 backups-disabled 标记，不创建备份或下载真实用户资料。

## 已执行验证（故障前）

- 阿里云备案详情读取网站备案号与审核通过状态。
- 权威 DNS、阿里公共 DNS 和腾讯公共 DNS 均返回两条 A 记录 8.133.186.15。
- HTTPS health 返回 200，证书验证结果为 0；www 与原 IP 的有归入口返回 308。
- 原 IP /riichi/ 返回 200，麻将容器 ID 与启动时间保持不变。
- Google Chrome 直接打开正式域名，显示有归登录界面。
- 备案页脚源代码通过 TypeScript 与 Next.js 生产构建检查。

## 发布中断：16:12 后的状态

正式域名、DNS、证书和 APP_ORIGIN 已生效并曾通过以上在线检查。有归仍使用 2904c46 镜像；8418c07 的备案页脚尚未发布。服务器构建在 TypeScript 阶段失败，VNC 显示 PID 1784461（tsc）被构建容器内存限制终止；不能据此宣称服务器构建成功。

随后另起的受限类型检查容器名为 yougui-domain-typecheck-8418c07。Workbench 命令开始超时，关闭本次新建连接后重连也出现 IncorrectStatus.CloudAssistantInvokeTimeout；外部 HTTPS 探测超时。云助手界面提交的停止本次容器命令 t-sh070e7kc36dn28 仍等待执行。当前无法确认该检查是否已经停止，尚未重启 ECS。

本次构建脚本没有启动自动发布，current 未主动切换至候选版本，数据库、附件卷和麻将服务均未主动重建。需要先恢复实例响应，再核对实际运行状态、终止本次检查任务，并重新验证域名访问。故障根因尚未完全确认，容器 OOM 与实例失去响应的因果关系仍需日志验证。

此外，实际路由检查发现 Caddy 中相对路径重定向需要显式通配 matcher：redir * /riichi/online/ 302。修正配置已准备，但远程命令超时，尚未确认生效；恢复后应验证 /mahjong 的 302 与 Location，并使正式域名的麻将入口转到独立应用，避免进入遗留页面。
