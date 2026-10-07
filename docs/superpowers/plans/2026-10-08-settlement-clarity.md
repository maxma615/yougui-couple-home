# Settlement Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修正手机结算遮挡并明确各席本次收支与新余额。

**Architecture:** 保留引擎记分与全席 ACK 机制。结算面板在内容滚动区计算只读分数预览，确认栏独立占据布局高度。

**Tech Stack:** 已锁定 Next 16.3.6、React 19.3、Vitest 5、Playwright 1.63。

**Spec:** `docs/superpowers/specs/2026-10-08-settlement-clarity.md`

## Global Constraints

- 仅编辑独立 couple-home 检出；不触碰另一应用或主目录并行任务。
- 不修改计分规则、服务器数据、牌桌摄影机或原始素材授权。
- 不备份、不下载真实用户数据；发布到已授权 `8.133.186.15`。
- 本机浏览器证据不等于真实安卓验收。

## Review Focus

- 多家荣和不能把两笔收支重复叠加。
- 流局、负余额与零收支须保持正确显示。
- 姓名很长、四席、鸣牌及长役种列表不能破坏可达性。
- 忙碌、断线或已经确认时不能重复发送 ACK。
- 页面滚动、内容滚动与确认按钮命中区域必须清楚分开。

### Task 1: 分数语义与内容结构

**Files:** `src/components/mahjong/mahjong-settlement-panel.tsx`、`tests/component/mahjong-settlement-panel.test.tsx`；新增 `tests/unit/mahjong-settlement-panel.test.tsx`。

- [x] 用物理牌墙与实际 Choice 构造四麻自摸、三麻双家荣和，先验证新展示缺失导致失败。
- [x] 增加结算前、本次收支、结算后预览；更新简短说明，不修改引擎。
- [x] 所有正文包进 `.mahjong-settlement-panel__content`，确认栏仍为 section 的直接子元素。
- [x] 验证顺序结算及实际 ACK、断线/忙碌禁用，类型检查通过。
- [x] 真实终局 ACK 后的 RED 复现已入账结算重复展示；终局已有排名时隐藏本局结算，定向两文件 11/11 通过。

### Task 2: 手机横屏布局

**Files:** `src/app/mahjong/mahjong.css`；ignored 真实浏览器验收工具。

- [x] 保留已取得的旧构建四案遮挡证据。
- [x] 容器采用列方向布局，正文保留网格与独立滚动；确认栏取消 sticky，实际占据高度。
- [x] 同四案验证初始与滚动末端无遮挡、役种/手牌可达、按钮实际触发 ACK；额外桌面与长姓名/鸣牌检查。

### Task 3: 审查与发布

**Files:** `docs/mahjong-settlement-clarity-acceptance.md`、`docs/mahjong-fidelity-progress.md`；ignored 独占发布工具。

- [ ] 独立审查产品和验证证据，运行所需测试、类型检查、干净生产构建与凭据扫描。
- [ ] 新鲜核验当前 f7baf30 实际源、镜像、构建、helper、清理器、资源及禁备份策略，冻结唯一发布构建。
- [ ] 在生产空桌与保护门检查通过后使用已核验的 no-backup 发布器，核验公网资源及业务表指纹保持不变。
- [ ] 主目录仅同步本次拥有路径，保留并行变更、HEAD、index 与其他文件；记录实际限制，持续目标保持 active。
