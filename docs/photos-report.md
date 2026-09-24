# 点滴与照片存储实施报告

日期：2026-09-23

## 实现范围

- 点滴支持列表、详情、新增、编辑和带版本的删除；列表按日期、创建时间和 ID 稳定倒序，所有 Moment 响应都附带照片 DTO。
- 照片上传只接受实际解码成功的 JPEG、PNG 和 WebP。服务端同时检查魔数、声称 MIME、字节上限、总像素上限、空文件、截断文件和完整像素解码。
- multipart 请求由有界读取器解析，`Content-Length` 只用于预检查；无长度的 chunked 请求也会在读取越界时立即停止。上传路由不调用无界 `request.formData()`。
- 原始文件名只作展示，路径型和控制字符文件名被拒绝。正式文件名由服务端随机生成，并且只允许受限 basename 进入存储路径。
- 照片读取必须经过会话与小屋成员检查，以 `O_NOFOLLOW` 打开普通文件，返回服务端识别的 MIME、`inline` disposition、`nosniff` 和 `private, no-store`。即使存储目录被人为放入指向其他服务器文件的符号链接，鉴权照片接口也不会跟随读取。

## 一致性边界

上传先在 `<ATTACHMENTS_DIR>/tmp` 写入临时文件并完成解码。随后业务事务取得 shared maintenance advisory lock，锁定父点滴及其版本，再把文件原子移入 `<ATTACHMENTS_DIR>/photos`。照片记录、父点滴版本和 moment 事件在同一事务内提交。

如果数据库写入或事件发布失败，正式文件会在 shared lock 释放前删除。如果删除本身失败，回滚后会在新的 shared-lock 事务中再次删除或登记到 `photo_cleanup_queue`；补偿登记失败不会被静默吞掉。因进程崩溃留下的正式或临时孤儿会被 `verify-storage` 识别，备份不应在此状态下完成。

删除照片或点滴时，数据库关联删除、清理队列登记、父点滴版本更新和事件发布共用事务。清理 worker 也取得 shared maintenance lock，已不存在的文件按幂等成功处理，其他文件系统失败会增加尝试次数并保留队列项。

## 存储检查

`verifyStorage(pool?, attachmentsDir?)` 和可直接执行的 `src/cli/verify-storage.ts` 分别报告：

- `valid`：数据库引用、字节数和 SHA-256 都正确的有效照片。
- `pendingCleanup`：合法待删文件，保留 `exists` 状态；文件已不存在仍是可恢复、可幂等继续的队列状态。
- `unknownOrphans`：无数据库引用的正式条目，以及 `tmp/` 中的崩溃遗留条目；普通文件、目录和符号链接都会被扫描，不会被静默忽略。
- `brokenReferences`：有效照片记录引用了不存在或非普通文件的条目。校验使用 `O_NOFOLLOW` 打开，不跟随符号链接读取附件目录外的内容。
- `hashMismatches`：有效或待删文件的字节数/SHA-256 与数据库不同。

`verify-storage` 遇到未知孤儿、断链或哈希异常时以状态码 2 结束；只有合法待清理项不视为一致性失败。

## 验证记录

- `npm test -- photo-lifecycle.test.ts photos-security.test.ts`：23 项通过，使用真实隔离 PostgreSQL 数据库和应用 `.local/tests/` 下每次测试独立附件目录。
- `npm test`：92 项通过。
- `npm run typecheck`：通过。
- `npm run build`：生产构建通过，包含点滴与照片 API 路由。

未执行真实公网发布、反向代理配置或长时间 worker 压力测试。附件目录没有通过静态路由开放；部署时仍需保持这一边界。
