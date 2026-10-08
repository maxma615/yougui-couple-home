# 本家副露与操作区避让（本地候选）

用户要求副露清晰、有实体感，吃碰杠和拔北等操作仅在合法时出现。当前运行源 b17ef23，本步尚未上线；相机偏斜和真实安卓验收仍未解决。

## 实际失败与定位

以当前正式 CSS 导入顺序挂载真实引擎已接受的副露，首次审计在 Chromium 三麻明杠、本家视角、1440×810 失败：两个顶面中心实际命中拔北按钮。失败日志 `.local/audit/current-meld-visual-bd0282c-r01.log`；补充截图和原生游戏状态记录在 `.local/audit/mahjong-meld-solid-1791447170396/failure.json`。主样式的 dock 定位被最后导入的 standing-tile 样式覆盖，首次基础样式调整无效，已撤销，其失败日志保留。

修正桌面时进一步发现 Chromium 三麻加杠、本家视角、844×390 的第二行牌被按钮遮挡，日志 `.local/audit/meld-dock-clearance-green-r02.log` 与 `.local/audit/mahjong-meld-solid-1791447263836/failure.json`。这属于独立实际失败，未将其称为通过。

## 方案与当前结果

仅当本家已存在公开副露时，在最终有效样式中将 dock 下方留白至少设为 30dvh + 10px，并保留原先选中手牌抬升所需的较大间距。未有本家副露时保持原操作区位置；规则、Choice、手牌、相机和素材未修改。浏览器副露审计改为读取页面真实 CSS 导入顺序，失败时保存截图和几何。

最终 `.local/audit/meld-dock-clearance-green-r03.log` 正常 exit 0，110 个 Chromium/WebKit 原生已接受 Choice 画面全部通过。覆盖三麻/四麻、碰/明杠/暗杠/加杠、各家视角和 667/844/1440 尺寸；证据 `.local/audit/mahjong-meld-solid-1791447324572/summary.json`。此检查证明公开牌实体顶面可点击且位于桌内，不证明所有可能多按钮响应组合都已验证。

最终操作回归 `.local/audit/meld-dock-action-touch-r03.log` 正常 exit 0，24 场景、0 失败（证据 `.local/audit/action-touch-1791447371058/proof.json`）；生产构建 `.local/audit/meld-dock-build-r01.log` 正常 exit 0，类型检查 `.local/audit/meld-dock-type-r01.log` 正常 exit 0。独立审查和 ECS 发布尚在进行；不得把本地候选称为已上线或整体体验已完全对齐。

## 独立审查后的根修正（当前候选）

一次独立审查确认 Important：本家已碰白板时，真实 p3 弃牌会给出荣和、三种吃、碰、明杠、过。固定上移避开了副露，却遮住牌河、场况台与对手暗手。此前 110 + 24 分别通过不足以证明它们的交互，候选 11d0aa6 未发布。

根一次修正：本家有副露且存在合法吃牌时，吃牌按钮及全部组合预览使用上方 HUD 空隙，其余响应在靠本家的一行；其余副露状态保留原避让规则。所有 Choice 和组合预览保留，未修改相机或规则。新增 `tests/browser/mahjong-native-response-clearance.tsx`，完整原生碰牌/加杠后再响应，精确断言七个合法 Choice、实际五类按钮，触控 44px、全部中心/四角命中、按钮矩形不遮公开信息。

原生实际 RED：`.local/audit/meld-native-response-red-r01.log`。最终碰牌6场景 `.local/audit/mahjong-native-response-clearance-pon-1791448843872/legal-results.json`；加杠6场景 `.local/audit/mahjong-native-response-clearance-added-1791448843872/legal-results.json`。两个 r03 日志均正常 exit 0，场景有 CSS/测试 SHA；较早并行 r02 输出目录碰撞，保留日志但不用作最终独立证据。

最终110副露：`.local/audit/meld-dock-clearance-final-r01.log`；24操作：`.local/audit/meld-dock-action-final-r01.log`；780测试：`.local/audit/meld-dock-full-final-r01.log`；构建、类型、秘密扫描分别为 build-final-r01 / type-final-r04 / secrets-final-r01，全部正常 exit 0。根裁定无未解决 Critical/Important；未二次审查。只读 ECS 父版核对正常 exit 0，仍 b17ef23，清理器与禁备份保持；真实候选 Linux 和发布尚待完成。全目标与真实安卓、用户实际偏斜原因仍未验收。
