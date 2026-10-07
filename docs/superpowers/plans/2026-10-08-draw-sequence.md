# Draw Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline, task-by-task.

**Goal:** 三／四人荒牌、途中流局与流满贯统一接入真实结果顺序，再继续终局体验。

**Architecture:** 原生引擎给出公开drawInfo，已有适配器保存各席旧局快照与私有逐页游标。UI按阶段呈现，不改变支付或提前暴露下一局。

**Tech Stack:** Next16.3.6、React19.3、Vitest5、Playwright1.63；不增依赖。

**Spec:** docs/superpowers/specs/2026-10-08-draw-sequence.md

## Global Constraints

- 只改couple-home独立检出，保留并行相册、原生规则与所有真实记录。
- 不备份、不下载用户数据，保留清理器、备份禁用标记和1CPU/768MiB。
- 原创/授权素材；公开手牌仅来自原生公开结果；安卓实机未验收须如实记录。

## Review Focus

- 流满贯多人交叉付款的单手点数不得混成赢家净收益，也不得重复入账。
- 途中流局公开手牌不能误标听牌；未听牌者和下一局闭手不能泄漏。
- 每席独立页面，最后全桌屏障；机器人或重复连接不能跳过真人页。
- 零收支、负分终局、供托在原生排名的变动不能被结果UI覆盖。
- 断线／重连／长姓名／横屏触达及计时需与已有和牌保持。

### Task 1: 原生drawInfo与结束手序列

Files: types.ts、engine.ts、sanma.ts、settlement-sequence.ts；tests/fixtures/mahjong-draw-game.ts、tests/unit/mahjong-draw-sequence.test.ts。

Interfaces: DrawInfo={kind:exhaustive|abort|nagashi,revealedHands:{seat,hand,waits}[],nagashiResults:{seat,points,delta}[]}；SettlementFlow.stage新增draw。

- [x] 写真实物理墙合法推进荒牌、九种九牌、单／双流满贯三/四麻用例，记录缺少drawInfo/flow的有效RED。
- [x] 引擎只增加原生公开结果元数据，分项总和必须等于原生支付；适配器按spec page模式收集，保留原生支付与终局。
- [x] 定向新测试和现有结果8项、engine/sanma/rooms通过；验证无私有牌、旧ACK/独立游标/最终屏障/排名一致，提交。

### Task 2: 听牌、原因、流满贯与桌面揭示

Files: 新mahjong-draw-summary.tsx、settlement-presentation.ts、use-settlement-presentation.ts、mahjong-settlement-panel.tsx、mahjong-client.tsx、mahjong.css；新组件和真实浏览器测试。

Interfaces: 消费Task1 DTO；draw页面确认1000ms+3000ms，揭示/面板过渡依据已保存的一手来源；scores沿现有时序。

- [ ] 新组件先RED：荒牌听牌授权手牌／无收支、途中原因无听牌标签、流满贯0番符隐藏、个人翻页／自动确认与断线取消。
- [ ] 实现原原创揭示／结果页，改终局文案为明确名次与比分，保留再开／解散；组件GREEN。
- [ ] mounted真实RoomStore驱动Chromium/WebKit三/四人横屏、真实ACK、长姓名滚动/触达；提交。

### Task 3: 联机回归、审查与发布

Files: 认证Socket／真实BotRunner测试、验收与fidelity文档、ignored候选／发布证据。

- [ ] 真实3/4人认证联机与人机、重连／越权／私有牌／解散验证；完整tests/type/build/secrets。
- [ ] 独立whole-branch review，实际RED→GREEN修复影响用户的发现。
- [ ] 冻结新artifact，重新核验3539a6c父版本或实际已授权新父版本；Linux固定imageID、NODE_ENV=test候选验证。
- [ ] 固定no-backup发布器、权威无真人牌局屏障后上线；公网TLS/资源、12表只读摘要、清理器／资源／策略核验；owned守卫同步。
- [ ] 记录真实验收边界，目标保持active；后续完整终局／评分已知差异／真实安卓继续。
