# 完整首版（M2）本地验收记录

日期：2026-09-23。M1记录见 [m1-acceptance.md](m1-acceptance.md)。本轮在M1真实本地闭环上加入共同日历，未进行公网部署。

## 本轮完成的功能

- 周一开始的42格月视图、选中日事项、完整新增/详情/编辑/确认删除、首页近期共同安排。
- 全天日期包含结束日；定时事项以UTC存储，按Asia/Shanghai显示。跨月、闰日、午夜结束、零时长和DST来源输入有明确语义。
- 日历范围0002-01-01至9998-12-31；API、控件和导航共用边界。分钟控件未改时间时保留已有秒/毫秒。
- 同屋授权、CSRF、版本409、事务内SSE、手机冲突对照/重试、网络失败保留草稿。
- 真实备份/恢复保留两类日历事项、时刻、版本、创建及最后修改成员；生产进程重启后同样保留。
- 开发模式关闭请求路径日志，避免邀请路径令牌出现在普通访问日志；关闭遮挡底部导航的开发指示器。

## 最新实测

| 命令/检查 | 实际结果 |
| --- | --- |
| `npm test` | 17 files，120/120通过 |
| 独立审查者重复calendar-time/calendar API目标测试 | 24/24通过，未发现可确认的重大问题 |
| `npm run typecheck` | exit0 |
| `npm run build` | 22静态页面和所有动态API/详情路由生成通过 |
| `npm run check:clean-build` | 无.env与运行配置的新源目录完整生产构建通过 |
| `npm run check:secrets` | 311个构建文件无当前凭据或附件绝对路径 |
| `npm run test:persistence` | 实际生产进程停止/启动，四类资源（含两类日历）、会话、版本、审计成员保持；新登录后三格式照片SHA一致 |
| `bash tests/scripts/run-empty-restore.sh` | 1实际空环境恢复通过，9个无关用例跳过 |
| `npm run test:e2e` | Chromium + WebKit mobile 30/30通过（2.9分钟），exit0 |
| 日历UI目标E2E | Chromium + WebKit mobile 8/8通过（37.7秒） |
| 生产依赖审计 | 本轮依赖未变化；M1 `npm audit --omit=dev` 0 vulnerabilities |

E2E包含四类实体完整权限矩阵、同源与限流、两会话SSE和撤销、纪念日/待办/点滴/日历CRUD、邀请/第三人拒绝、断线回退、冲突与草稿保留、照片第二张失败后的原地重试及手机横向溢出检查。浏览器使用上海与洛杉矶时区；日历固定测试时钟，避免测试依赖执行当天月份。

每轮E2E有独立数据库、附件与端口；本次结果归档在 `.local/e2e/run-tujCAt/test-results/`，`.last-run.json` 为 passed 且无失败用例，测试库和附件已清理。页面截图只有隔离测试账号/资料，不是正式用户数据。日历截图见 [手机月视图](screenshots/calendar-webkit-mobile.png) 和 [桌面月视图](screenshots/calendar-chromium.png)。

## 验收范围和部署前待验项

本地功能验收使用macOS、Node26.9、PostgreSQL18.6、桌面Chromium和iPhone尺寸WebKit。已人工查看手机月视图截图；未进行真实手机硬件验收。

机器没有Docker，因此没有执行Linux容器构建/运行、容器卷空恢复、Compose维护脚本真实停启，以及目标服务器的DNS/HTTPS验收。运维文件和配置模板已提供；这些项目必须在明确授权的部署目标复验。当前交付不宣称已公网部署或目标部署环境验收通过。

初始业务数据库为空，不生成正式账号或示例内容。初次使用按README安全交互初始化账号，再由本人创建小屋和邀请第二位成员。

交付时已用 `npm start` 启动本地生产版本 `http://127.0.0.1:3000`；启动迁移通过，`/api/health` 返回200及 `{"status":"ok"}`，`/login` 返回200并包含登录界面。该进程仅监听本机回环地址。
