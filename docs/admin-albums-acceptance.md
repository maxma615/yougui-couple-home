# 管理员相册验收记录

日期：2026-10-07。用户授权管理员面板查看所有空间的相册。

管理员面板新增“空间相册”，列出全部空间、成员数和照片数。每页 60 张缩略图；可加载更多、打开大图、切换、缩放、查看原图。文件编号不显示，无编辑和删除入口。空相册、加载失败、重试与快速切换均有明确反馈。

## 权限与缓存

- GET `/api/admin/albums`、`/api/admin/albums/[id]`、`/api/admin/photos/[id]` 每次检查有效会话与数据库管理员角色。
- 未登录 401，普通成员访问管理员接口 403；成员原 API 的跨空间读取仍为 404。
- 管理员接口只读，变更方法为 405；普通成员照片删除接口不会授予管理员权限。
- 照片复用 640 / 1280 像素 WebP、原图与私有条件缓存；授权在 304 判断前执行。
- API 不返回记录正文或磁盘路径，文件读取不跟随符号链接。

## 已执行的本机验证

- 实现前新浏览器测试因接口 404 失败，确认缺少该功能。
- `npm run typecheck`：通过。
- `npm test -- --maxWorkers=2 --no-file-parallelism`：56 文件、485 项通过。
- `npm run check:clean-build`：无运行配置的生产构建通过。
- `npm run test:e2e -- admin-albums.spec.ts admin.spec.ts`：8 项通过。
- `npm run test:e2e -- admin-albums.spec.ts album-browsing.spec.ts`：14 项通过。
- 加入分页与乱序响应验证后 `npm run test:e2e -- admin-albums.spec.ts`：4 项通过，Chromium / 手机尺寸 WebKit。
- `git diff --check`：本功能文件通过。

测试使用隔离 PostgreSQL 数据库与合成照片，测试结束删除自有测试夹具。本机浏览器模拟不代表真实安卓设备验收。

## 发布策略

基于服务器当前发布源 `70e70601aa5cc347cf734e2d9600dc1471a453eb` 冻结本功能与已授权的备份禁用守卫，不携带其他对话未发布变更。无数据库模式变化，不生成生产备份、不下载私人资料、不执行服务器磁盘清理。现有业务持久化卷原位保留。

Linux 与公网发布证据在实际验证后补充。
