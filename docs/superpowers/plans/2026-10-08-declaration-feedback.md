# 声明反馈实施计划

> 使用 superpowers:executing-plans 在当前隔离工作树内实施；现有用户授权允许自主开发与指定 ECS 发布。

Spec: docs/superpowers/specs/2026-10-08-declaration-feedback.md

## Task1 原生公开和牌声明
- [x] 原生三/四麻多荣、自摸、所有席位、私有 ACK、拷贝隔离、draw 负例 RED。
- [x] PublicWinDeclaration/SettlementFlow 可选兼容字段、Sequence 原生结果收集与 view 独立拷贝；GREEN/完整回归/提交。

Task1 evidence: `.local/audit/declaration-feedback-20261008/native-red-r02.log` (4 intended missing-field failures / 4 draw negative passes), `native-green-r01.log` (44/44 declaration/sequence/draw/abort tests), `full-r01.log` (726/726 across 74 files), `type-r01.log` (exit0). Native legal single ron, double ron and tsumo are exercised in both variants; modifying a returned declaration does not affect any viewer, private detail navigation preserves the public list, and final all-seat ACK still releases the sequence. No production changes yet.

## Task2 同步声明与提示声
- [ ] 严格公开事件规划，立直弃牌与新结算声明时钟/身份证明 RED；不通过泛化 feedback 推断。
- [ ] 同步多荣桌边声明、立直/自摸提示；复用静音和音频生命周期，无旧帧补播。
- [ ] 原创短声音波形与实际浏览器时序/取消/输入/ACK 验证。

## Task3 验收与发布
- [ ] 完整 tests/type/build/secrets、旧声明/流局/声音/副露回归；一次整阶段审查与单次必要修复。
- [ ] 父版 a258986 固定镜像与 Linux 验证、无真人牌局受保护发布/Public TLS/12表/清理器/禁备份核对。
- [ ] 保护主目录同步与验收文档，保留角色素材/Android/整体目标未完成范围。
