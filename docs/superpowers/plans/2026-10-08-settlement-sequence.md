# Settlement Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 三/四人和牌按赢家逐页显示，再进行一次统一收支展示，带可验证的确认时序。

**Architecture:** 保留原生支付引擎，以结构式 wrapper 保存各席结束快照，收集原生结果并管理展示 ACK。组件消费结果 DTO，按相对耗时播放揭示/计分与自动确认。

**Tech Stack:** Next 16.3.6、React 19.3、Vitest 5、Playwright 1.63。

**Spec:** `docs/superpowers/specs/2026-10-08-settlement-sequence.md`

## Global Constraints

- 只编辑 couple-home 的独立检出，不改学术应用、根 Git 或共享文档。
- 不改变支付规则、不创建真实数据备份、不下载用户记录或照片。
- 结果阶段的下一局私有牌与其他席私有快照不能泄漏。
- 保留当前并行相册改动、1 CPU/768 MiB、清理器与禁备份策略。
- 原创动画排程不冒称厂商语音/逐帧一致；实际安卓仍须单独验收。

## Review Focus

- 多荣中旧分必须固定，各原生 delta 只计一次；棒分不能被多页重复增加。
- 个人详情立即推进；最终 ACK 全席屏障、旧阶段 ACK、刷新与多个同账号客户端不能跳过阶段。
- 结果尚在展示时，不提前暴露新手牌或完成/重开房间。
- 自动确认遇到忙碌、离线、卸载、已确认不能重复发送；服务器与设备时钟偏差不影响倒数。
- 长姓名、役种、三/四席和手机横屏保持内容可达，确认行不遮挡正文。

### Task 1: 服务器结果序列

Files: `src/modules/mahjong/types.ts`、新 `settlement-sequence.ts`、`rooms.ts`；新 `tests/unit/mahjong-settlement-sequence.test.ts`。

Interfaces: `MahjongGame` 提供 `view/respond`；`SettlementFlow` 使用 spec 固定字段；`SettlementSequenceGame(engine, seatCount, {now})` 包装原生引擎。

- [x] 写 RoomStore+真实物理墙双荣测试，先观察当前 DTO 缺少 flow、第二赢家前已入账的有效 RED。
- [x] 实现 wrapper 与 RoomStore 包装入口。严格界限、逐席索引与时钟、最终全席 ACK、快照/返回值隔离；不改原生支付代码。
- [x] GREEN 覆盖三/四人、自摸、终局、陈旧/重复操作及原生最终分数一致；运行 rooms/engine/sanma 相关现有测试。
- [x] 提交服务器步骤，记录实际 RED/GREEN 和产品 SHA。

### Task 2: 详情、分数与确认计时

Files: `mahjong-settlement-panel.tsx`、新 `use-settlement-presentation.ts`、新 `settlement-presentation.ts`、`mahjong.css`、`mahjong-client.tsx`；新组件测试。

Interfaces: hook 消费 flow+当前 ACK/connected/busy/onChoice，返回相对 elapsed、canConfirm、countdown、按33步计算的显示分数；纯时序函数与常量由新 presentation 模块导出。

- [x] 新 DTO 组件测试先 RED：详情无收支，分数页无手牌；按钮时序、自动确认一次、断线与卸载取消。
- [x] 实现明确阶段与原创揭示动画、33步整数计分。无 flow 的现有流局保持；屏幕减少动态效果不重播。
- [x] 新测试及既有11项结算组件通过；浏览器验证横屏滚动、实际 ACK 和三个以上阶段，不把假时钟当真机证据。
- [x] 提交 UI 步骤。

### Task 3: 联机、审查与实际发布

Files: 真实 Socket 测试、ignored 浏览器证据与发布工具、`docs/mahjong-settlement-sequence-acceptance.md`、fidelity progress。

- [x] 本机隔离真实服务验证三/四席、机器人 ACK、断线与重连、权限/私有牌、最终比分及解散；必要回归覆盖此次接口变化。
- [x] 运行完整测试、类型、干净构建和凭据扫描，独立 whole-branch review，修复确实影响用户的发现。
- [x] 冻结新源码/构建，核验当前父版本 aa9c16a；Linux 候选测试必须设置 NODE_ENV=test，按固定 image ID 检查。
- [x] 按已授权 no-backup 发布流程，在权威无真人牌桌检查后切换；验证资源、12表摘要、清理器与全部公网资源，守卫同步拥有路径。
- [x] 验收记录真实范围；整体目标保持 active，未证实的规则与真机边界继续保留。
