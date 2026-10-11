# 牌桌方向一致的全局弹窗 · 2026-10-11 本地候选

手机竖屏会把牌桌旋转为横向，但解散确认和规则弹窗是 GameRoom 的兄弟节点，未继承牌桌方向和画幅。原生客户端验证复现了竖屏解散框，且原“查看规则”位于固定牌桌遮住的页头。

现在两个原生 dialog 使用牌桌对应的逻辑宽高、居中和旋转方向，限制在16:9画幅内；规则内容在短画幅中滚动，按钮至少44px。牌桌工具栏增加规则入口，固定牌桌期间隐藏被遮住的页头控件，避免重复的键盘和读屏入口。触控关闭和 Escape 会回到实际入口；确认解散仍走原房间命令，取消不提交。大厅弹窗保留自然屏幕方向。

## 实际证据

- 原生RED：`.local/audit/global-dialogs-red-r02.log`，375×667触屏中的解散框 transform 为 none，未旋转；不是测试副本的弹窗。
- 正式 MahjongClient、HTTP、Socket.IO 与 RoomStore，Chromium/WebKit × 三/四麻 × 375×667、390×844、412×915、844×390、1440×810，共20完整流程通过。确认旋转与画幅边界、工具栏点按、关闭和Escape后的焦点、短屏滚轮实际滚动、弹窗打开时横竖屏切换、解散只POST一次，以及退出后的大厅方向恢复。
- 最终原生记录：`.local/audit/global-dialogs-native-final-r01.log`；源摘要、真实截图和结果：`.local/audit/global-dialogs-1791692920082/`。UI运行源码在测试期间未改变。
- 全套1259项/107文件通过：`.local/audit/global-dialogs-full-r02.log`。第一轮有6项备份测试因本机PATH缺少pg_dump失败；显式使用已有PostgreSQL18.6工具后全部通过，未修改测试或产品以绕过失败。备份测试仅用合成测试资料，不涉及生产资料。
- 类型、生产构建及374个构建文件秘密扫描通过：`.local/audit/global-dialogs-{types,build,secrets}-final-r01.log`。
- 自检中发现触控取消后的焦点丢失并修正；大屏规则内容无需滚动，测试不再错误要求它强行溢出。新增桌内入口产生的重复可访问控件由真实Root测试复现后解决。

本轮只修改客户端、规则弹窗和画幅CSS，没有修改麻将算法、业务数据库、独立线下记分应用或学术工具。

## 发布状态与余项

本轮已完成本地候选，尚未做候选同镜像Linux验证或ECS切换。2026-10-11本轮只读核对的线上仍为2904c46 / Build RqnAIDwiv2x4ZidrGOC7i，镜像sha256:d5eeb401cf699efd51d9a0665e1d21c54163ffca98c967601b164ea775e87d3b，1CPU/768MiB且正常运行，禁备份标记保留。核对证据为`.local/ecs-deploy/late-response-remote-captures/late-response-global-dialogs-current-r01.json`。

下一阶段绑定当前候选源码与构建，执行同镜像Linux和受控发布；不可把本地修复说成已经上线。真实安卓触摸滚动、浏览器安全区、GPU透视和生产认证WSS仍不能由本轮桌面浏览器代替；完整游戏尺度、音画反馈与其他基本体验余项继续按麻将进度推进，当前目标未完成。
