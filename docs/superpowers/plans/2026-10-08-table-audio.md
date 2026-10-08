# 牌桌声音 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让真实权威牌桌动作具有同步声音反馈，并提供可靠的播放／静音生命周期。
**Architecture:** Separate strict public event planning, browser AudioContext synthesis/control, and GameRoom rendering integration; reuse proven physical-event identities and finite timing. Do not route sounds through lossy text-feedback state.
**Tech Stack:** TypeScript,React,WebAudio,Vitest,Playwright,existing native fixtures and frozen publisher.
**Spec:** docs/superpowers/specs/2026-10-08-table-audio.md

## Review Focus
身份／版本／旧帧去重，实际落地同步，动作取消后的声音，后台或静音恢复不补播，AudioContext权限失败不影响游戏，声源释放，公开信息与负载边界。

### Task1 公开声音事件证明
- [x] 真实原生三／四麻连续摸／切／拔北／副露fixture写RED，覆盖基线／跳帧／换桌／观看席位／身份缺失／结算。
- [x] 实现独立纯事件规划器与稳定主键，复用严格公开证明；运行GREEN与旧事件回归、提交。

### Task2 实际声音与生命周期
- [x] 先写解锁／静音／后台／断线／去重／源释放RED；实现原创WebAudio声源与控制器。
- [x] 绑定实际物理动画完成及无动画的权威状态，补牌不提前响；加入44px静音控件。
- [x] 实际OfflineAudioContext波形及两个浏览器播放／时序／解锁／中断GREEN。

### Task3 完整验收发布
- [ ] 完整tests/type/build/secrets和联机／浏览器回归；一次独立整分支审查与必要修复。
- [ ] 022e07a父版保护、新固定Linux候选、无真人牌桌发布、公网／数据／清理器／禁备份验证。
- [ ] 所属文件与文档受保护同步，保留Android／角色语音与整体未完成范围。
