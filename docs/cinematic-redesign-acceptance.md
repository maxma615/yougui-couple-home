# 情侣空间整站重构：本地验收

日期：2026-10-05。实施：Codex 与三个页面子代理；整合、浏览器验证和独立审查由 Codex 完成。

## 交付结果

已完成登录、初始化、邀请、首页、相册、点滴详情和编辑、日历、纪念日、待办、我们及全部新增/编辑表单的重构。界面统一称为“情侣空间”，保留品牌“有归”及用户自行填写的名称；内部路由、API 和数据库结构保持原有接口。

视觉按批准的 Monolith + Nature + Unseen 方向实现：午夜底色、淡紫光影、宋体标题、细线布局、真实照片展示。首页和公共入口使用原创夜色建筑场景，优化后的本地 WebP 约 92 KB，不依赖远程图片或字体。装饰场景不作为用户回忆；相册和首页照片仍从原有鉴权接口读取。

手机有五项底部导航，桌面保留六项入口。首页照片可切换封面；相册提供封面及照片墙，点滴支持大图、切换、加载失败重试。改密和资料编辑使用弹窗，含焦点管理、保存状态、错误反馈及关闭后返回焦点。姓名可完全清空，提交校验或实时刷新不会覆盖输入。动效覆盖导航、按钮、照片、页面与弹窗，并尊重减少动态效果设置。

## 实际验证

以下命令均在 couple-home 内执行，并获得成功退出状态。数据库与附件测试使用隔离环境。

| 命令 | 结果与范围 | 本地日志 |
| --- | --- | --- |
| `npm test` | 17 个文件、120 项通过；真实 PostgreSQL 权限、邀请竞争、版本冲突、迁移、照片管线、空目标备份恢复及安全规则 | `.local/cinematic-native/final-unit.log` |
| `npm run test:e2e` | 70/70 通过，3.8 分钟；桌面 Chromium 与手机尺寸 WebKit，各 35 项 | `.local/cinematic-native/final-e2e.log` |
| `npm run build` | 生产构建通过；生成全部页面和 API 路由 | `.local/cinematic-native/final-build.log` |
| `npm run typecheck` | TypeScript 检查通过 | `.local/cinematic-native/final-typecheck.log` |
| `npm run check:clean-build` | 新目录中的源码与 public 资源在没有环境文件、数据库地址、运行秘密及附件配置时构建通过 | `.local/cinematic-native/final-clean-build.log` |
| `npm run check:secrets` | 318 个构建文件通过扫描，没有配置中的凭据或附件路径 | `.local/cinematic-native/final-secrets.log` |
| `npm run test:persistence` | 生产进程真实停启；空间、各资源、两类日历、会话、版本和审计成员保留；重新登录后 JPEG/PNG/WebP 的 SHA-256 一致 | `.local/cinematic-native/final-persistence.log` |

浏览器验证覆盖首位账号登录与建空间、第二位邀请注册、拒绝第三位、过期与满员邀请、改密会话轮换、所有资源增改删、照片上传失败重试、实时同步、断线轮询、离线恢复、冲突保留草稿、删除确认与重试、焦点返回及减少动态效果。320px 检查全部主要路由和新增表单，没有横向滚动；非上海浏览器仍按北京时间处理日历。

## 审查后修复

- 实时删除当前末张照片时，选中索引可能越界。现在保留可浏览的剩余照片，并关闭已失效的大图；两种浏览器的回归均通过。
- 资料保存过程中继续输入可能在成功关闭弹窗时丢失。现在保存期间锁定字段，失败后保留提交内容并恢复编辑；回归通过。
- WebKit 中图片较早触发的加载失败可能被挂载后的状态重置覆盖。照片组件按照片身份重置，大图同步初始化；加载失败及重试回归通过。
- 两条待办同时保存，旧闭包可能让较晚响应覆盖另一条已经完成的状态。新增真实 PATCH 延迟响应测试，修复前稳定失败；改为函数式合并，并保留更高版本记录，桌面与手机回归通过。

独立审查复查了这些修复与对应测试。最终构建、完整 E2E 和持久化检查均在整合后执行。

## 预览与截图

预览已重新启动：[本地情侣空间](http://127.0.0.1:3000/home)。实际读取 `/api/health` 和原创 WebP 均返回 200；另用 Chromium 验证登录表单可见、可编辑，320px 登录页无横向滚动。业务操作通过上述隔离数据库的浏览器用例验收，没有向现有用户空间插入演示内容。

截图来自受控测试账号。图中相册使用原创装饰图作为上传测试素材，展示照片布局，不代表真实用户照片；“晴天小屋”是测试账号的自定义空间名，不受界面称呼变更影响。

| 页面 | 桌面 | 手机 |
| --- | --- | --- |
| 首页 | [截图](screenshots/cinematic-home-chromium.png) | [截图](screenshots/cinematic-home-webkit-mobile.png) |
| 相册 | [截图](screenshots/cinematic-moments-chromium.png) | [截图](screenshots/cinematic-moments-webkit-mobile.png) |
| 点滴详情 | [截图](screenshots/cinematic-moment-detail-chromium.png) | [截图](screenshots/cinematic-moment-detail-webkit-mobile.png) |
| 日历 | [截图](screenshots/cinematic-calendar-chromium.png) | [截图](screenshots/cinematic-calendar-webkit-mobile.png) |
| 纪念日 | [截图](screenshots/cinematic-anniversaries-chromium.png) | [截图](screenshots/cinematic-anniversaries-webkit-mobile.png) |
| 待办 | [截图](screenshots/cinematic-todos-chromium.png) | [截图](screenshots/cinematic-todos-webkit-mobile.png) |
| 我们 | [截图](screenshots/cinematic-settings-chromium.png) | [截图](screenshots/cinematic-settings-webkit-mobile.png) |
| 修改密码 | [截图](screenshots/cinematic-password-chromium.png) | [截图](screenshots/cinematic-password-webkit-mobile.png) |
| 登录 | [截图](screenshots/cinematic-login-desktop.png) | [截图](screenshots/cinematic-login-mobile.png) |
| 初始化 | [截图](screenshots/cinematic-setup-chromium.png) | [截图](screenshots/cinematic-setup-webkit-mobile.png) |
| 邀请 | [截图](screenshots/cinematic-invite-chromium.png) | [截图](screenshots/cinematic-invite-webkit-mobile.png) |

## 验收边界

这是 macOS 本地、真实数据库与浏览器验收。手机尺寸与 WebKit 模拟不能替代真实安卓设备的输入法、性能及浏览器验收；安卓实机、Linux/Docker 和 ECS 公网部署仍待验证。此次未执行远端发布，不改变学术工作台的文件、进程或数据。

2026-10-05 后续已单独完成 Linux/Docker 与上海 ECS 公网 HTTPS 发布，原有密码与业务数据保持一致；实际部署验证见 [ECS 发布记录](ecs-deployment.md)。安卓实机验收仍未完成。本段补充不改变上面本地验收当时的范围。

已有未提交内容在 `.local/cinematic-native/baseline.patch` 与 `baseline-status.txt` 留下基线；本次整合保留已有功能，未重置或清理原有工作。
