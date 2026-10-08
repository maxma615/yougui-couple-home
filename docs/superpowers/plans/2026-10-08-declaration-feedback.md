# 声明反馈实施计划

> 使用 superpowers:executing-plans 在当前隔离工作树内实施；现有用户授权允许自主开发与指定 ECS 发布。

Spec: docs/superpowers/specs/2026-10-08-declaration-feedback.md

## Task1 原生公开和牌声明
- [x] 原生三/四麻多荣、自摸、所有席位、私有 ACK、拷贝隔离、draw 负例 RED。
- [x] PublicWinDeclaration/SettlementFlow 可选兼容字段、Sequence 原生结果收集与 view 独立拷贝；GREEN/完整回归/提交。

Task1 evidence: `.local/audit/declaration-feedback-20261008/native-red-r02.log` (4 intended missing-field failures / 4 draw negative passes), `native-green-r01.log` (44/44 declaration/sequence/draw/abort tests), `full-r01.log` (726/726 across 74 files), `type-r01.log` (exit0). Native legal single ron, double ron and tsumo are exercised in both variants; modifying a returned declaration does not affect any viewer, private detail navigation preserves the public list, and final all-seat ACK still releases the sequence. No production changes yet.

## Task2 同步声明与提示声
- [x] 严格公开事件规划，立直弃牌与新结算声明时钟/身份证明 RED；不通过泛化 feedback 推断。
- [x] 同步多荣桌边声明、立直/自摸提示；复用静音和音频生命周期，无旧帧补播。
- [x] 原创短声音波形与实际浏览器时序/取消/输入/ACK 验证。

Task2 evidence in `.local/audit/declaration-feedback-20261008/`: planner RED r02 four positive failures, GREEN r01 20 tests and chankan-r01 21 tests; UI RED r02 two failures/GREEN r01 five; audio RED r01 four failures/GREEN r02 38 declaration/player regression tests; intro RED r01/GREEN r01 35 component tests. `full-r02.log` 763/763 in 78 files, type-r02/build-r01/secrets-r01 exit0. Browser r05 covers 12 actual GameRoom scenes in Chromium/WebKit, both variants and three declarations, plus 20 actual pending multi-ron interruptions. Wave-browser-r01 renders 14 actual offline waveforms including original three new motifs; call-regression-r03 passes all 36 native call scenes with actual page CSS import order. Historical cached reference's showRong/showZimo starts text at300ms (200ms entry) and expires1200ms, with ron cues300+30*i; adopted original UI/tone implementation, not vendor graphics or recordings. Win detail0 has1200ms declaration lead-in before its ordinary result presentation and confirmation clock; later detail pages keep their existing clocks. Stage3 review/Linux/publish remain pending; runtime still a258986.

## Task3 验收与发布
- [x] 完整 tests/type/build/secrets、旧声明/流局/声音/副露回归；一次整阶段审查与单次必要修复。
- [ ] 父版 a258986 固定镜像与 Linux 验证、无真人牌局受保护发布/Public TLS/12表/清理器/禁备份核对。
- [ ] 保护主目录同步与验收文档，保留角色素材/Android/整体目标未完成范围。

Review/fix evidence: one fresh read-only review `/root/declaration_feedback_final_review`, summary `.local/audit/declaration-feedback-final-review-20261008.md`. Two Important findings handled in one fix pass: native normal/kokushi/double north robbery RED six cases → GREEN34; first winner confirmation tests fail5 on isolated pre-intro parent cd888e5 → current23/23. During the same pass, browser-r06 exposed stalled main-thread multi-ron coalescing; component stalled-spacing RED reproduces0ms gap → GREEN27 declaration/old audio tests, with actual-start minimum30ms for later cues and muted intermediate cue cancellation. Final full-r04 passes778/778 in78files; type-r05/build-r03/secrets-r02 pass. Browser-r07 passes18 actual native declaration scenes (including all three north robberies) plus20 pending multi-ron interruptions; table-audio-regression-r01 42, abort-regression-r01 38, draw-regression-r01 24 and call-regression-r03 36. Local Linux target selection14files/230 tests is only selection evidence, not Linux acceptance. ECS read-only parent-r01 verifies live a258986 hashes, cleaner and disabled backup policy; no production mutation. Linux/publish/protected sync still pending.
