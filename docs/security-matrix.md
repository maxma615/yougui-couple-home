# 权限与失败边界

API 路由统一以服务器 Cookie 会话获取 userId/homeId。表内外键只是第二层约束；对外查询、更新、删除本身限定homeId，客户端传入homeId不会改变作用范围。

| 入口 | 无会话 | 未建屋账号 | 当前小屋成员 | 其他小屋资源ID | 状态变更额外要求 |
| --- | --- | --- | --- | --- | --- |
| session | 401 | 可读取本人及home=null | 本人/本屋摘要 | 不接受自报homeId | 只读 |
| auth/password、logout | 密码401；logout幂等 | 可执行 | 可执行 | 不接受目标账号 | 同源JSON；密码限流 |
| home POST | 401 | 可首次建屋 | 重复创建拒绝 | 不接受自报homeId | 同源JSON |
| home PATCH、invites POST | 401 | 403 | 可操作本屋 | 不接受目标homeId | 同源JSON；home版本 |
| anniversaries/todos/moments/calendar | 401 | 403 | 列表/CRUD | 404 | 同源JSON；更新删除版本 |
| moments/:id/photos POST | 401 | 403 | 真图/上限/版本检查 | 404 | 同源multipart；父点滴版本 |
| photos/:id GET/DELETE | 401 | 403 | 鉴权读取/删除 | 404 | 删除同源JSON和父版本 |
| events | 401 | 403 | 本屋元数据事件 | 不接受目标homeId | 持续校验会话、失效关闭 |
| invite/:token GET/POST | 最小预览/受控消费 | 同公共边界 | 同公共边界 | 不透露其他记录 | 消费同源JSON、限流、过期/一次/两人限制 |
| health、auth/login | 受控公开 | 可用 | 可用 | 不查询业务资源 | 登录同源JSON、限流 |

未建屋状态并不禁止账号修改密码、退出或创建小屋。照片接口禁止反向代理直接暴露附件目录；不存在公开图片路径或分享token。

主要自动证据：`tests/e2e/api-security.spec.ts`（真实HTTP/SSE/限流）、`tests/api/authorization.test.ts`（CSRF/JSON/来源及限流恢复）、`tests/api/photos-security.test.ts`（鉴权图片/有界请求/路径和头）、各资源API测试（跨屋/版本/事务），以及 `tests/security/secrets.test.ts`。

日历行属于M2扩展，已纳入30项浏览器回归及120项单元/集成测试，结果见 [M2验收记录](m2-acceptance.md)；历史M1验收记录不包含该行。结构化安全日志使用字段白名单，不含密码/Cookie/token/正文；构建秘密扫描不打印所检查的实际凭据。
