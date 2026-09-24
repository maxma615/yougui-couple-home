# 认证、配对与小屋设置实现报告

日期：2026-09-23

## 已实现

- 首位账号初始化使用 Argon2id（64 MiB、3 次迭代），全局首次初始化通过表锁保证并发时仅一人成功；CLI 密码只从安全环境变量或不回显的 TTY 输入读取，拒绝 `--password`。
- 登录、退出、改密、管理员重置和服务器会话已经实现。会话令牌使用 32 字节随机值，数据库只保存 HMAC-SHA-256 摘要；Cookie 为 `HttpOnly`、`SameSite=Lax`，生产环境增加 `Secure`。过期时间采用严格大于比较。
- 登录与改密在昂贵哈希运算后重新锁定账号并比较原密码哈希，避免重置密码与正在登录/改密的请求交错后建立旧凭据会话。改密和重置均撤销该账号全部旧会话；改密只建立一个新会话。
- `requireSession` 允许已登录但尚未建屋的首位账号通过；`requireHomeMember` 对无小屋账号返回 403，并只从服务器会话解析 `homeId`。
- 小屋创建、读取和设置更新已经实现。创建时锁定账号并保证一个账号只能属于一个小屋；设置更新在单事务内修改小屋及一至两位成员显示名，使用版本号检测冲突，并在 409 的 `error.current` 中返回安全 Home DTO。
- 邀请只保存随机令牌摘要。消费邀请先在事务外完成密码哈希，再按固定顺序锁定小屋和邀请；账号、成员、邀请消费、会话、Home 版本及事件在一个事务内提交。相同令牌以及不同令牌争抢最后一个名额时均只有一个成功，失败不会留下账号。
- 所有业务写事务使用备份共享 advisory lock；Home 创建、邀请加入和设置更新与 `publishHomeEvent` 使用同一个 `PoolClient` 提交。
- API 已覆盖 `/api/auth/login`、`logout`、`password`、`/api/session`、`/api/home` 和邀请路由。JSON 写请求严格校验同源及 `application/json`，实际流读取上限 256 KiB；JSON 必须是对象。响应和错误统一 `Cache-Control: no-store`。
- 登录、邀请和改密按账号及来源限流。实现忽略可伪造的 `X-Forwarded-For`；来源不可用时使用保守的共享桶。限流桶会清理过期项并设置 4096 项硬上限，先检查来源桶再分配账号桶。
- 上海纯日期工具不通过隐式 UTC 解析，支持日历合法性、恋爱首日计为第 1 天、闰日周年在非闰年映射至 2 月 28 日，并覆盖 0099/0100 年边界。

## 公开接口

- `src/lib/auth-context.ts`: `requireSession(request, target?, now?)`、`requireHomeMember(request, target?, now?)`、`AuthContext`。
- `src/modules/auth/session.ts`: `createSession`、`revokeUserSessions`、`revokeSessionToken`、Cookie 序列化与安全令牌摘要辅助函数。
- `src/modules/auth/service.ts`: `initializeAdmin`、`login`、`changePassword`、`resetPassword`、`getSessionSnapshot`。
- `src/modules/auth/invitation.ts`: `issueInvitation`、`getInvitationPreview`、`acceptInvitation`。
- `src/modules/home/service.ts`: `createHome`、`getHome`、`updateHome`；Home DTO 在 `src/modules/home/schema.ts`。
- `src/lib/http.ts`: `assertJsonMutation`、`readJson`、`apiRoute`、`json`。
- `src/lib/scoped-update.ts`: `updateWithVersion(table,id,homeId,version,patch,targetDb?,toPublic?)`。业务写入需要传 `drizzle(tx)`，并在同一 `PoolClient` 事务内调用 `publishHomeEvent`；含非公开列的表必须提供 `toPublic`。
- `src/lib/local-date.ts`: `parseLocalDate`、`shanghaiToday`、`daysTogether`、`nextOccurrence`。

## 实际验证

- `npm test -- auth.test.ts authorization.test.ts invitation-race.test.ts local-date.test.ts`：4 个文件、30 项测试全部通过。
- 本轮较早在 Task 5 文件写入前执行 `npm test`：9 个文件、51 项测试全部通过。
- 本轮较早在 Task 5 文件写入前执行 `npm run typecheck`：通过。
- 本轮较早在 Task 5 文件写入前执行 `npm run build`：生产构建通过，认证、Session、Home、邀请及已有生活资源路由均完成编译和静态生成检查。
- 最新全套验证期间，Task 5 正在并行写入：`npm test` 因当时尚不存在的 `src/modules/moments/service.ts` 停在 `photo-lifecycle.test.ts` 导入阶段；随后最新 `npm run build` 因 Task 5 的 `PoolClient`/`Pool` 类型不匹配及尚未落盘的 `src/modules/photos/validate.ts` 失败。目标四组测试仍为 30/30 通过；这些并行中的失败不归入本任务完成声明，由总协调任务在 Task 5 落盘后执行全量闸门。

## 当前限制

- 限流状态保存在单个应用进程内。当前单实例部署可以工作；若以后横向扩展为多个 Web 实例，需要迁移到共享限流存储。
- Web `Request` 没有服务器观察到的客户端地址时，所有请求共享保守来源桶，可能产生共同限流；实现不会用攻击者可控的转发头绕过限制。可信反向代理接入应由后续部署层显式传入服务器确认的地址。
- 本报告只覆盖本地后端实现与真实隔离 PostgreSQL 测试；未执行公网部署、生产账号操作或外部消息发送。
