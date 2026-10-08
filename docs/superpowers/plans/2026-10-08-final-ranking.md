# 终局名次展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 用可重连的服务器时间线还原终局排名展示节奏，保持原生排名和全桌确认边界。

**Architecture:** RoomStore owns a finish timestamp; a dedicated component consumes an optional public elapsed-time DTO. A finite client clock presents ordered rows without changing engine balances.

**Tech Stack:** TypeScript / React / Vitest / Socket.IO / Playwright.

**Spec:** docs/superpowers/specs/2026-10-08-final-ranking.md

## Global Constraints
原生积分、排名、供托不变；原创素材；不提前公开排名；无自动终局ACK；不生成备份或下载真实资料；当前inline自主执行授权继续有效。

## Review Focus
1. 最后一位电脑确认与真人确认均只能触发一次结束时间。
2. 断线重连、后台恢复和同id乱序响应不能倒退或重播。
3. 同分、负分和超长名称不能改变原生排名或遮挡分数。
4. 动效期间退出仍可用；未连接、busy和非房主不能重新开局。
5. 三人/四人有限时钟结束后不留下循环或卸载后的更新。

### Task 1: 服务器终局时间接口
**Files:** src/modules/mahjong/rooms.ts, types.ts; tests/unit/mahjong-rooms.test.ts.
- [x] 写真实原生结束与注入now的失败用例：最后人/电脑确认、重读、离开、重开及提前排名不可见。
- [x] 运行RED并保存真实失败原因。
- [x] 实现finishedAt一次性赋值与rankingFlow DTO，不改变引擎支付。
- [x] 运行GREEN并提交。

### Task 2: 终局组件及有限时间线
**Files:** create src/components/mahjong/mahjong-final-ranking.tsx and final-ranking-presentation.ts; modify mahjong-client.tsx, src/app/mahjong/mahjong.css; create tests/components/mahjong-final-ranking.test.tsx.
- [x] 写组件RED覆盖三四人所有时刻、重连/乱序、新id、负数同分长名、离线busy与卸载。
- [x] 实现server-relative有限时钟、原生排序、200ms行入场与1000ms淡入；终局主操作按4200/5000开放。
- [x] 运行GREEN；实际两浏览器667×375/1440×810布局、动态偏好与行为验证；提交。

### Task 3: 原生联机与发布验证
**Files:** tests/integration/mahjong-draw-runtime.test.ts; docs/mahjong-final-ranking-acceptance.md; new immutable local audit namespace.
- [x] 扩展真实认证Socket终局、电脑确认、重连与再次开局检查。
- [x] 完整测试、类型、构建、secrets通过；一次独立整个变更终审，修复必要问题。
- [x] 固定新候选镜像Linux验收；当前父版6c7dc33/12表/禁备份/清理器/无真人牌局保护全部通过后发布。
- [x] 实际公网摘要、数据摘要、资源限制验证；安全同步仅自有文件；记录局限并保持完整目标active。
