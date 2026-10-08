# 双击桌布快捷操作（2026-10-09）

## 对齐依据及实现

已缓存官方旧Web客户端（https://game.maj-soul.com/1/v0.11.252.w/code.js）的DesktopInfo双击处理、UI_ChiPengHu.onDoubleClick、UI_LiQiZiMo.onDoubleClick及ViewPlayer_Me.onDoubleClick显示：double_click_pass默认0，存储值1才开启；两次点击严格小于300ms，对他家出牌执行取消操作，自家选牌先返回，再根据can_discard/last_tile切最后一张。只用于核对行为，未复制厂商代码、图片或声音；当前厂商完整画面仍非已证明相同。

新增“便捷操作”内默认关闭的“双击过牌／摸切”，同浏览器保存显式偏好。鼠标/触控在真正空白桌布的两次主指针释放小于300ms才处理；不把牌、牌河、头像、按钮或弹窗算空白。超过8px移动、右键、非主指针、pointercancel、按键、失焦、pagehide、可见性变化、忙碌/断线、换房/席位/游戏/决定清除手势，不使用轮询、服务器模型或附加推演。

全部操作来自当前原生Choice：他家出牌时选择合法pass（包含明确放弃荣和）；自家立直/杠牌组合先返回，不提交。普通自家回合切精确drawnTile_；碰牌后没有摸牌时切当前牌列最后一张合法牌。不把同点数手牌混成摸切，不擅自选其他牌；无合法选项、结果阶段不提交。通过真实实体元素复用submitHandChoice及来源几何，同一呈现决定只发送一次；本开关不改变自动和牌/不鸣牌等默认偏好。

实际补牌验证取得有效RED：原候选在拔北的新决定已经合法、补牌仍被隐藏时，双击桌布提交了一次弃牌。现就绪条件接到既有nukiMotion.heldDecisionId与drawArrival.arriving，等拔北落地/入手结束才识别新手势；没有添加猜测延迟或修改这两个动画hook。被阻止的手势不在动画结束后自动补发，用户重新双击才出牌。

## 实际验收

- 新开关缺失取得组件RED，新增动作选择和手势控制器后，52项定向检查通过。最终完整972项/92文件、类型、生产构建和374文件凭据扫描全部实际exit0；日志`blank-table-full-r01.log`、`blank-table-type-r02.log`、`blank-table-build-r01.log`、`blank-table-secrets-r01.log`。
- 控制器覆盖默认关闭/显式存储/存储失败、299ms触发/300ms不触发、拖动/右键/非主指针/控件、同决定去重、换决定、取消/后台/忙碌、返回选牌后第二次明确双击；原生三/四麻验证自摸/北牌的精确弃牌、合法荣和pass、选牌返回、结果/无选项，以及真实碰牌后无drawnTile的最后一张切牌。
- 首版浏览器136场景通过，属于中间候选；新增补牌场景后`blank-table-replacement-red-r01.log`实际exit1，失败`.local/audit/blank-table-browser-1791494432787/failure.json`保留一次原生接受的隐藏补牌弃牌，不把旧136结果作为最终证据。
- 修正后正式GameRoom createRoot与物理108/136张引擎，Chromium/WebKit × 三/四麻 × 667×375/1440×810 × 真正mouse/touchscreen输入，144唯一场景实际exit0。其中16默认关闭零提交，其余128 UI指令均合法接受；16碰牌后从真实普通牌元素获取弃牌几何，8三麻补牌场景先进行原生拔北准备，隐藏/入手期间零回调、解除后重新双击才一笔精确弃牌；同呈现决定额外双击不再提交。立直/多暗杠第一对点击只返回、下一对才切牌；可自摸时也不误自摸，合法荣和时明确pass。新增菜单44px且在短横屏内。没有force点击、假时钟或放宽超时。
- 当前最终`.local/audit/blank-table-browser-1791494481574/proof.json`，SHA256 `49ea5afb8e11539e4f07a458c6a8045204b75697cd9a47bb0b1520b3e91f15ca`，结束时与根复核时源摘要匹配。短横屏补牌画面实际查看；WebKit软件截图偏斜属于已有取帧问题，没有修改相机或声称原设备透视已验收。
- 原有触控/鼠标动作24场景、拖牌及生命周期24场景实际exit0：`.local/audit/action-touch-1791494590359/proof.json`、`.local/audit/seat-drag-blank-table-lifecycle-1791494589780/proof.json`。CSS/脚本及来源绑定复核通过；24拖牌包含6正常出牌和18失焦/pagehide/隐藏取消恢复。生命周期事件为测试触发，不是硬件切后台验收。

根最终复核`.local/audit/blank-table-final-review-r01.json`非独立，未发现未解决Critical/Important；既有拔北和入手hook与HEAD字节相同。无需规则/协议/权限/数据迁移或新的服务器算法。

## 当前交付范围

代码及验收记录提交后立即推送GitHub main和工作分支。本步仍是本地完成的候选，Linux及ECS发布待下一步；上一轮正式发布为820bc85 / Build gxd3NxhCMNuLmu2jN1ePn。没有宣称新快捷开关已上线。

浏览器测试通过桥接回调把UI选择交给原生引擎，HTTP/生产账号/TLS/WSS不包含在本步144场景中。真实Android、生产网络失败/重连的完整手势验收和完整当前厂商体验继续待验证；原完整目标active，未缩小为本次快捷操作。
