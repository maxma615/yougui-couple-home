# 按下抬牌与释放确认（2026-10-09，本地候选）

对照已缓存官方v0.11.252客户端的ViewPlayer_Me.onMouseDown/onMouseUp：按下时立即预选抬牌，同时保存按下前是否已选择该实体；没有拖拽时，只有当时已经选中的牌才在释放后提交。拖回手牌区取消此次拖拽与选择。只参考交互行为，没有复制厂商实现或素材。

正式GameRoom现在在pointerdown冻结确认资格和未抬起的手牌边界，再更新实体选择；click消费冻结资格。首次按下立即抬牌、首次释放只选中；第二次释放确认。桌面已有悬停预选时，仍可单击出牌。长按时间不会把第一次按下变成确认，切换到重复牌的另一张实体需要重新确认。取消、失焦、隐藏、离桌、断线及忙碌时，沿用现有清理选择并清掉确认资格；拖回无提交且先清选中，鼠标继续悬停可以再次预选。

原生Choice、重复实体ID、拖牌合法落点、冻结rackTop、实体测量、出牌飞行和相机没有改为替代实现。正常键盘/无pointerdown的明确激活沿用已有两次激活逻辑。

## 实际验证

- `hand-press-red-r01.log`初版新增用例缺少jsdom PointerEvent构造，单独不足以证明缺口；补齐与既有指针测试一致的MouseEvent构造后，旧源码真实失败记录于`.local/audit/hand-press-red-r02.log`，其余31项通过。恢复当前产品源码后转绿。
- `.local/audit/hand-press-target-r03.log`：74项/5文件通过，覆盖立即抬牌、首次释放零提交、第二次确认、重复实体及生命周期取消，与现有出牌和手牌重排回归。
- `.local/audit/hand-press-full-r01.log`：1004项/93文件实际通过；类型、生产构建及374构建文件扫描通过（hand-press-type/build/secrets-r01.log）。
- `.local/audit/hand-hover-browser-1791501134260/proof.json`：48个Chromium/WebKit真实浏览器场景；三/四麻、两横屏尺寸、默认鼠标、触屏、桌面二次点击、失焦、立直与按住。真实mouse.down/up观察按下即抬起、首次长按释放零提交、第二次释放单笔原生接受；触屏使用真实tap，两次点按保持。实体几何/Choice身份与物理108/136张规则引擎绑定，没有force/假时钟/扩大时限。
- 拖牌首轮`.local/audit/seat-drag-hand-press-1791501135384/proof.json`为23通过/1失败，保留。错误是假设拖回60ms后仍保持未选中，而WebKit合法继续悬停重新预选。仅把测试改为观察真实aria状态变更中先出现取消选中，并核对零指令，没有改产品来迎合该断言。
- 最终`.local/audit/seat-drag-hand-press-final-1791501230827/proof.json`：明确选择的24个拖牌场景全部通过，包含有效落点、拖回、指针取消、断线，两个浏览器与三个横屏尺寸。不是完整相机/座位验收。
- `.local/audit/press-final/linux-local.json`：当前受限Linux选择在本机571项/36文件通过，不能替代ECS候选镜像运行。根审查非独立，最终源码摘要与浏览器证明一致。

本轮候选完成后立即commit/push至用户GitHub；当前线上仍9c01164。候选的同镜像ECS Linux、发布和公网核对仍待进行；真实Android、正式账号WSS故障与完整当前厂商音画协议体验未全部验收，原始目标保持active。
