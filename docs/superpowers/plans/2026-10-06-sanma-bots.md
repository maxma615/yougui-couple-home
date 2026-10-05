# 日本三麻与电脑补位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [x]`) syntax.

**Goal:** 真正的三席日本三麻，以及三/四人桌的基础电脑补位，完成真实混合对局并安全部署。
**Architecture:** 四麻继续用已有 RiichiGame；新增三席 SanmaGame，复用固定版本的 Shoupai/Util 识别役和向听。RoomStore 维护真实/电脑席位，单 worker 与有界队列负责有限时的电脑决策；现有 Socket.IO 与按需进程同步所有状态。
**Tech Stack:** TypeScript、Node 24 worker_threads、@kobalab/majiang-core 1.4.1、Next 16.3.6、React、Vitest、Playwright、PostgreSQL、Docker。
**Spec:** `docs/superpowers/specs/2026-10-06-sanma-bots-design.md`

## Global Constraints

- 108 张牌，移除二至八万；真正三席，不模拟第四人。每家 35000 点，赤五筒/索各一枚；禁止吃，可拔北；完整采用 Spec 三麻规则（含抢北、振听、立直后拔北、多人四杠、流局满贯、责任支付、双荣和）。
- 自摸损：子满贯收庄 4000、另一子 2000；庄满贯两家各 4000。每本场自摸两家各 100、荣和 300。荒牌罚符总额 3000，最终点数与立直棒守恒。
- 至少一位真实成员；电脑不创建网站账号。只在大厅由房主添加/移除/补齐；开局后不换人，重赛保留电脑席。
- 一个 worker，JavaScript 堆 64 MiB，计算目标 50ms、200ms 硬截止；有界队列最大 32 项，连续三次 worker 失败后本进程转用轻量合法回退。仅输入本席私有视图与公开状态，禁止读取对手暗牌或牌山。
- 所有真人离线立即暂停电脑，十分钟清桌；电脑行为不能刷新真人活跃时间；空桌十分钟退出，父进程退出取消 worker/timers。
- 所有实现、测试、产物仅在情侣应用独立工作区。现有鉴权、nonce、roomId、decisionId、跨空间权限和四人真人功能保持。
- 本机测试/构建，服务器不同时跑构建、完整测试与图片压力。受限 Linux 验证、备份及实际恢复后发布原 ECS；不改真实账号密码或私人资料。

## Review Focus

1. 立直后换手、抢北/暗杠及过胡：合法选项不得绕过振听或役判断；归 Task 1。
2. 多次响应、双荣和与终局立直棒：每次只结算一次，分配及排名守恒；归 Task 1。
3. 房主退出只剩电脑、所有真人断线、旧 worker 结果：立即取消/暂停，不保持弃置对局活跃；归 Task 2。
4. 用户伪造 bot ID、重复 nonce、满桌腾位：沿用真实身份，只房主操作，撤销身份后 socket 断开；归 Task 2。
5. 手机三席/结算、合法拔北同步、电脑迅速出牌后的刷新：不出现第四席、重复切牌或整页横向溢出；归 Task 3。

---

### Task 1: 三席规则引擎

**Files:** Create `src/modules/mahjong/sanma.ts`, `sanma-wall.ts`, `sanma-scoring.ts`; Modify `types.ts`, `core.d.ts` (only rule/utility declarations); Test `tests/unit/mahjong-sanma.test.ts` and focused wall/scoring tests if needed.
**Interfaces:** Produce `SanmaGame(mode: GameMode, names: string[], options?: SanmaOptions)` with `view(seat: number): GameView`, `respond(seat: number, decisionId: string, choiceId: string): void`. `SanmaOptions` supports deterministic dealer and a physically valid injected wall/initial hands fixture without exposing it to clients. Add `ChoiceType = ... | "nuki"` and optional `PublicPlayer.nuki?: number` (actual north count); four-player DTO keys remain as before. Add `GameVariant = "sanma" | "yonma"` for next task. Keep existing RiichiGame adapter intact.

- [x] Write tests first: counts total 108/no m2..m8/no m0, first hands 13/13/14, three player winds/turns, 35000; no chi; unique decision IDs and forbidden/stale options refused. Hand-check dealer/child mangan tsumo and ron, honba, 1/2/0/3 tenpai distribution.
- [x] Run targeted tests RED, then implement crypto shuffled wall/dead wall, genuine three-seat driver and scoring helpers. Read actual pinned library internals; do not assume configurable seat count or use four-player fenpei directly. Correct one/nine man dora through controlled scoring input, retain North bonus without making it a yaku.
- [x] Add deterministic fixtures for nuki replacement/no new dora, available reserve, drawn-only riichi nuki, kokushi robbed North and ordinary ankan, ron passing furiten, double ron, four-kan abort/one-player four-kan, nagashi/paō. Full east/hanchan go through rounds, settlements, ranking within a bounded move loop; initial score total 105000 plus unclaimed riichi conserved throughout.
- [x] Run focused Sanma tests and existing `tests/unit/mahjong-engine.test.ts`; typecheck may temporarily report unhandled nuki in the UI until Task 3—record precisely. Self-review all spec rules, commit only owned files.

### Task 2: 电脑策略、席位与后台调度

**Files:** Create `src/modules/mahjong/bot-strategy.ts`, `bot-worker.ts`, `bot-runner.ts`; Modify `rooms.ts`, `server.ts`, `types.ts`; Test `tests/unit/mahjong-bots.test.ts`, `mahjong-rooms.test.ts`, `tests/integration/mahjong-bots-runtime.test.ts`, existing runtime/wake tests if required.
**Interfaces:** Consume Task 1 SanmaGame. Add `RoomView.variant: GameVariant` and `RoomMember.kind: "human" | "bot"`; create accepts optional variant, defaults yonma for existing callers. Add host commands `add-bot` (seat integer 0..3), `remove-bot` (seat), `fill-bots`, all with roomId/nonce. Produce `chooseBotChoice(view: GameView, variant: GameVariant, seat: number): string` and separate cheap `fallbackBotChoice(view): string`; input is only a public/private DTO with legal choices and its own seat number (needed for self wind and excluding itself from opponents). `RoomStore` exposes internal bot decisions and validated internal respond method, never a public command accepting arbitrary playerId. Bot runner hooks into server push/lifecycle and `close()`.

- [x] Write RED room tests for three-seat capacity, one/two humans + computers, human/nonhost rejection, all-computer prevention, bot ID login/command impersonation prevention, rematch ready flags and removing/filling only in lobby.
- [x] Write RED strategy tests: legal tsumo/ron priority, known shanten-improving discard, public risk against riichi, legal North extraction, kan/call/riichi, no opponents' private/wall keys in worker DTO. Implement deterministic bounded evaluation (shanten/outs/dora/public safety) and conservative calls with a yaku path.
- [x] Implement single reusable worker with ready handshake (startup outside 200ms job budget), resourceLimits {maxOldGenerationSizeMb:48,maxYoungGenerationSizeMb:8,codeRangeSizeMb:4,stackSizeMb:2} and verify actual V8 heap limit ≤64 MiB, queue 32, timeout termination/fallback, bounded restarts, disposal. Explicit execArgv for TS loader must not inherit incompatible flags; after the last table is removed terminate the unused worker rather than keep it alive for the service idle grace. Pre-action validate room ID/version/decisionId/seat to discard stale results. Add 250–450ms visual delay without blocking requests. At most one computational task simultaneously.
- [x] Room bot identities are internal `bot:<uuid>` with kind discriminator, not DB users. Connection/liveness uses human seats only. Separate human activity timestamps from bot moves; if host leaves a finished/lobby table with no humans remove it immediately, otherwise host becomes a human.
- [x] Run real single-human/maximum-computer complete three and four player games through ranking with immediate test pacing, test worker timeout/crash/stale/paused/dispose. Run authentication/runtime/wake/nonce regressions. Collect local per-decision timing and heap/RSS separately; self-review and commit only task files.

### Task 3: 三麻/电脑界面和浏览器闭环

**Files:** Modify `src/components/mahjong/mahjong-client.tsx`, `src/app/mahjong/mahjong.css`; optionally split `mahjong-rules.tsx` for concise rules dialog; Modify `tests/e2e/mahjong.spec.ts`; Create `tests/e2e/mahjong-bots.spec.ts` and focused authenticated nuki runtime/socket test; narrowly add typed optional `RoomStore.gameFactory` / `runMahjongServer.rooms` dependency injection for a physically valid deterministic test wall, with unchanged production defaults and no HTTP/env fixture hook.
**Interfaces:** Consume Task 2 room/command/member contracts and Task 1 nuki choice/player count. Variant selector independent from east/hanchan; dynamic capacity drives ready counts, seats, score rows and relative positions.

- [x] Write real isolated-browser RED cases: two humans plus one computer Sanma, solo Sanma plus two computers, solo Yonma plus three; nonhost cannot change bots; adding/removing/filling reflected across pages; third seat limit.
- [x] Implement variant selector default yonma, dynamic create label, empty-seat host add/remove computer, fill action; bot labels with automatic ready. Draw three actual player panels; four retains its original layout. Add legal "拔北" action and public North count, complete three-row settlement/ranking, rules dialog with selected variant's concrete limits. Keep prior removal of defensive/redundant copy.
- [x] Test real start, bot action visibility with socket updates, refresh preserving hand, both profiles no overflow, host dissolve confirmation and idle lobby no false game banner. Verify a deterministic valid isolated nuki fixture through runtime socket test if browser crypto draw does not guarantee North; no production debug endpoint.
- [x] Run both new and existing Mahjong browser tests, focused components if any, `npm run typecheck`, full unit/integration suite (single worker), build and secret scan; self-review and commit.

### Task 4: 资源验证、复审与发布

**Files:** Add `docs/sanma-bots-acceptance.md`, scoped `.local/ecs-deploy` helpers and measurement artifact; Modify `deploy/compose.ip.yml` only after measured budget, deployment docs as necessary.
**Interfaces:** Entire tested source and one Linux image built with existing native Linux dependencies; current source deployment checked fresh before publication.

- [ ] Whole-branch fresh review against spec; fix real rules/scheduler/privacy failures before claiming completion. Full mixed end-to-end games and tests must not silently permit timeout/OOM.
- [x] Run bounded Linux task (one CPU, memory limit, no overlapping photo QA/build) using isolated DB/accounts: real mixed complete Sanma/Yonma, 200ms cancellation, decision latency distribution, application/worker RSS, idle cleanup. Measure host available memory, site latency and actual cgroup bounds. Select app cap no more than 1 CPU / 768MiB initially, with validation to adjust if normal gameplay needs more; CPU throttling and swap behavior recorded.
- [x] Produce consistent production backup and actually restore into empty isolated storage/database with hashes under the new image. Verify original user/member/photo counts and delete only own QA data.
- [ ] Publish with expected-current guard/rollback, no active real tables. Preserve account credentials and original volumes. Use original members' short-lived QA sessions for actual 2 humans + 1 bot Sanma and four-player computer fill/socket updates, dissolve and revoke only QA sessions. Verify health, assets, idle release and origin/permission boundaries.
- [ ] Save actual tests/resource evidence plus missing physical Android acceptance; synchronize only owned source to primary working folder without committing unrelated changes. Final answer explains usage and practical limitations.
