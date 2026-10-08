# 本家副露与操作区避让（本地候选）

用户要求副露清晰、有实体感，吃碰杠和拔北等操作仅在合法时出现。当前运行源 b17ef23，本步尚未上线；相机偏斜和真实安卓验收仍未解决。

## 实际失败与定位

以当前正式 CSS 导入顺序挂载真实引擎已接受的副露，首次审计在 Chromium 三麻明杠、本家视角、1440×810 失败：两个顶面中心实际命中拔北按钮。失败日志 `.local/audit/current-meld-visual-bd0282c-r01.log`；补充截图和原生游戏状态记录在 `.local/audit/mahjong-meld-solid-1791447170396/failure.json`。主样式的 dock 定位被最后导入的 standing-tile 样式覆盖，首次基础样式调整无效，已撤销，其失败日志保留。

修正桌面时进一步发现 Chromium 三麻加杠、本家视角、844×390 的第二行牌被按钮遮挡，日志 `.local/audit/meld-dock-clearance-green-r02.log` 与 `.local/audit/mahjong-meld-solid-1791447263836/failure.json`。这属于独立实际失败，未将其称为通过。

## 方案与当前结果

仅当本家已存在公开副露时，在最终有效样式中将 dock 下方留白至少设为 30dvh + 10px，并保留原先选中手牌抬升所需的较大间距。未有本家副露时保持原操作区位置；规则、Choice、手牌、相机和素材未修改。浏览器副露审计改为读取页面真实 CSS 导入顺序，失败时保存截图和几何。

最终 `.local/audit/meld-dock-clearance-green-r03.log` 正常 exit 0，110 个 Chromium/WebKit 原生已接受 Choice 画面全部通过。覆盖三麻/四麻、碰/明杠/暗杠/加杠、各家视角和 667/844/1440 尺寸；证据 `.local/audit/mahjong-meld-solid-1791447324572/summary.json`。此检查证明公开牌实体顶面可点击且位于桌内，不证明所有可能多按钮响应组合都已验证。

最终操作回归 `.local/audit/meld-dock-action-touch-r03.log` 正常 exit 0，24 场景、0 失败（证据 `.local/audit/action-touch-1791447371058/proof.json`）；生产构建 `.local/audit/meld-dock-build-r01.log` 正常 exit 0，类型检查 `.local/audit/meld-dock-type-r01.log` 正常 exit 0。独立审查和 ECS 发布尚在进行；不得把本地候选称为已上线或整体体验已完全对齐。
