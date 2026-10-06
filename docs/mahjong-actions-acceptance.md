# 自摸、立直选项与沉浸牌桌验收

2026-10-06。基线 `b5431e0`，原线上运行源码 `a6056a3`。用户提供三麻南家截图，门前手牌为 `p123345s456678z44`，刚摸到一筒，剩余 25 张，没有副露或拔北；底部只露出动作按钮上沿。

## 根因与处理

原界面将页眉、局况、固定高度牌桌和操作条依次排入普通文档流。在 1280×720 的 Chromium 窗口，回归断言明确失败为 `自摸 outside viewport`。本次将进行中的对局改为整个视口的独立牌桌，操作区固定在手牌上方右侧。自摸和立直选项常驻，只有实际服务器 Choice 存在时才能点击；不会凭客户端判断生成和牌或立直命令。已结束的最终名次仍用正常页面布局。

真实三麻实体牌墙复现南家上述牌型、余牌 25、无副露及拔北，引擎返回自摸，并结算为门前清自摸和、平和。夹具刻意采用无相关宝牌的指示牌，验证基础役为 20 符 2 翻，不代表截图的宝牌或实际得点。相同门前听牌形摸入非和牌也能合法立直。四麻四种庄家/座次轮转都将自摸和立直选项交给正确玩家。引擎源码、规则、服务器协议和持久化没有修改。未读取该生产会话的实际 Choice，因此不把本地指定状态的证明说成已读取线上那次响应。

## 视觉与交互

以[雀魂官方操作参考](https://mahjongsoul.com/startguide/assets/jantama_startguide.pdf)与实际对局画面研究围桌构图：全幅蓝色桌布、中央分数和局况、四侧背面手牌与副露同排、牌河紧邻中央、左上实际宝牌指示、橙色牌背和立体白色牌身。保留三麻真实三席；暗杠保持背面，副露详情仍为原生只读弹窗。牌桌和牌面由 CSS、原创 SVG 实现，不加入持续 WebGL 渲染或模型。

独立审查发现新固定布局会遮住服务器错误提示，且桌面断线状态会推动牌桌下移。两项已修复：错误提示独立显示在桌面之上且关闭按钮可正常点击，断线与方向提示在操作区上方显示而不改变桌面原点。状态复审通过。

## 实际验证

- 组件与客户端响应顺序：22/22，通过。包含真实门前拔北替代摸的自摸 Choice 传递、无合法选项时按钮保持禁用、全屏生命周期及公开副露只读交互。
- 三麻/四麻引擎目标测试：40/40，通过。新增指定牌型、剩余 25 张、自摸计分、立直提交及四种玩家映射；未修改引擎源码。
- 真实隔离账号和 Socket 联机浏览器回归及只读详情：Chromium/WebKit 16/16、56 秒通过。其中公开副露只读展示的 2 个案例使用显示 API 夹具；其余 14 个走真实联机。该运行在状态提示的 CSS 修正之前，状态增量另以以下独立几何测试覆盖。
- 公开显示压力和动作视口：两种浏览器、三/四麻、667×375、844×390、1280×720、1440×810、连接/断线共 32/32，通过。覆盖 24 张河牌、5 指示、4 副露、动作按钮完整可见、桌面 y=0、错误提示不被遮住。该夹具只验证显示足迹，不声称完成合法整局。
- 独立状态复审：16/16，正常、断线、方向提示及错误提示/关闭按钮中心命中检查通过，普通浏览器 click 不需要 force。

- 最终头像与状态样式增量：Chromium/WebKit 6/6、17.6 秒通过，运行 `run-ik1du4`。包含三/四麻真实联机手机横屏、1280×720 桌面动作区、头像 HTTP 200 且 SHA256 与本地文件一致、公开副露详情。该轮 4 个走真实联机、2 个只读详情使用展示 API 夹具。最终组件/引擎合计 62/62、布局 32/32 重新通过。

预览图为最终增量实际浏览器回归截图：[桌面](screenshots/mahjong-immersive-desktop.png)、[手机横屏](screenshots/mahjong-immersive-mobile.png)。本机自动化不代表实际安卓手机已验收，浏览器不支持方向 API 时仍需手动旋转。实际发布状态待部署记录补齐；生产连接不是空桌的证明，发布前必须保留真实进行中的牌局。

## 构建与复审

最终构建 `npm run build` 成功，BuildID `nfbKSyQWyJ_y4O3oLvd9u`；`npm run typecheck`、`git diff --check` 与编译产物凭据扫描 359 文件通过。独立最终增量审查 Approved：头像位置、风位、真实联机截图、资源 HTTP/SHA 断言、三/四麻新增规则回归没有确认问题，另独立运行两引擎测试文件 40/40 通过。部署不得清空仍在进行中的牌桌；线上是否切换由后续实际发布记录确认。

## 原创角色素材


- Asset: `public/images/mahjong-seat-portraits-v1.webp`
- Format and size: WebP, 768 × 768 px, 103,498 bytes, RGB, no alpha.
- Source: `/Users/Max/.codex/generated_images/01a111b2-a667-7970-b3b1-be5a745aa3f2/exec-3d4257c4-08b3-4c7a-832f-e989d7eae0e4.png` (PNG, 1254 × 1254 px).
- Generation mode: built-in `image_gen` tool; source resized with the app's installed `sharp` to 768 × 768 and encoded as WebP at quality 85. The square source was resized without cropping.
- Inspection: confirmed a clean 2 × 2 split, four distinct portraits, no text/logos/watermarks/tiles, and faces remain readable at small avatar size.
- CSS atlas cells: top-left (0%, 0%), top-right (100%, 0%), bottom-left (0%, 100%), bottom-right (100%, 100%) with `background-size: 200% 200%`.

## Exact generation prompt

```text
Use case: stylized-concept
Asset type: a single square 2×2 avatar atlas for a riichi mahjong web game, intended for CSS background-position cropping
Primary request: Create one square image divided into EXACTLY four equal square quadrants, with no gutters, no borders, and no overlap across quadrant boundaries. Each quadrant contains exactly one distinct original adult Japanese anime character portrait.
Scene/backdrop: Each quadrant has its own simple, softly colored background: warm cream in the top-left, muted peach in the top-right, soft indigo in the bottom-left, and pale sage in the bottom-right. Clean, uncluttered.
Subject: Top-left: chestnut-haired adult woman with warm hazel eyes and a restrained floral hairpin. Top-right: short ink-blue-haired adult man with thoughtful eyes. Bottom-left: silver-bob adult woman with violet eyes. Bottom-right: brown-haired adult man with a gentle smile. All are clearly adults, dressed in elegant Japanese casual or kimono-inspired clothing visible at the shoulders.
Style/medium: Premium polished riichi game character art, fine clean line art, restrained cel shading, expressive but understated faces, refined anime illustration.
Composition/framing: Strict 2×2 grid with a precise center split both horizontally and vertically. Each portrait is a centered, close head-and-shoulders crop, face fully contained well inside its own quadrant with comfortable margin from the center seams and outer edges. All four faces similarly sized and readable when each quadrant is displayed at 48px. One character per quadrant, no extra figures. One atlas = one image.
Lighting/mood: Soft, even portrait lighting; elegant, warm, calm.
Color palette: Restrained harmonious tones; the four distinct backgrounds specified above.
Constraints: All designs must be original, with no named or existing characters and no resemblance to recognizable game characters. No game logos, no words, no watermark, no mahjong tiles, no table, no interface elements. Sharp clean quadrant boundaries with no dividing lines.
```
