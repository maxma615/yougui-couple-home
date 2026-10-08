# 特殊流局序列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完整实现原生特殊流局的声明/三荣/公开亮牌/原因页排程。
**Architecture:** Add public native abort metadata to DrawInfo; compute finite boundaries in settlement-presentation; mount seat-oriented original ron indicators in GameRoom using its existing server-relative clock. Keep settlement native ACK barrier and payments unchanged.
**Tech Stack:** TypeScript,React,Vitest,Playwright,Socket.IO,existing frozen Linux publisher.
**Spec:** docs/superpowers/specs/2026-10-08-abort-sequence.md

## Global Constraints
原生分数/供托不变；只用已公开手牌；原创素材；无新常驻按钮；现有最后实体弃牌屏障不回退；禁备份/无真实资料下载/无在线合成牌局；inline自主执行授权保持。

## Review Focus
1. 立直弃牌被三荣或四杠截断，声明时序不能偷偷更改供托支付。
2. 三荣和玩家座位轮转/换庄，提示必须映射真实荣家，放铳者藏牌保持隐藏。
3. 同一局乱序/重连与后台恢复，CSS和有限时钟不重新播放已过阶段。
4. 三人空席、长昵称、手机横屏，提示不挡牌/按钮且正常动作不回归。
5. 最后一张重叠实体弃牌、电脑确认及私人ACK页，结果不能提前/下一局不能泄露。

### Task 1: 原生abort元数据和完整牌山fixture
**Files:** src/modules/mahjong/types.ts,engine.ts,sanma.ts; create tests/fixtures/mahjong-abort-game.ts and tests/unit/mahjong-abort-sequence.test.ts.
- [x] 从实际native-probe-r01提炼完整牌山合法场景；增加三麻四杠和换庄/声明中断样例。
- [x] 元数据、公开手牌、原生比分/供托与最后ACK写RED并实际运行。
- [x] 实现可选abortPresentation，仅原生公开动作；深拷贝/序列保持。
- [x] GREEN、原生旧回归、提交。

### Task 2: 有限排程及对应席位三荣提示
**Files:** settlement-presentation.ts,mahjong-client.tsx,mahjong-settlement-panel.tsx; create mahjong-abort-announcements.tsx and mahjong-abort-announcements.css; tests/component/mahjong-abort-sequence.test.tsx; tests/browser/mahjong-abort-sequence.tsx.
- [x] 按A分支、三荣300/500/1200及亮牌/原因/确认所有边界写实际组件RED，含旧DTO/重连/乱序/新阶段/卸载。
- [x] 实现排程与原生座位指示，500ms原因淡入；保留旧动作反馈/实体弃牌屏障。
- [x] GREEN，实际两浏览器原生GameRoom完整矩阵、长名/44px/减少动态/连续弃牌时序；提交。

### Task 3: 联机、独立终审、固定候选发布
**Files:** extend tests/integration/mahjong-draw-runtime.test.ts; docs/mahjong-abort-sequence-acceptance.md and measurements artifact; immutable new audit/ops namespace.
- [ ] 真实认证Socket/电脑/独立ACK/重连/权限/最后屏障回归，检查不能提前进下一手。
- [ ] 完整tests/type/build/secrets通过，一次独立整分支终审，必要问题一次RED→GREEN修复。
- [ ] 当前5178263父镜像/helper/禁备份/清理器/12表/无真人牌桌保护；新固定镜像Linux验收通过后发布。
- [ ] 公网摘要、数据和资源限制验证；安全同步自有文件与文档；保持整体目标active。
