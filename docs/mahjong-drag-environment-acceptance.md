# 拖牌期间显示环境变化

2026-10-08。本地修复验证中，尚未发布；线上仍为5b5eaef。

窗口尺寸变化后，拖牌仍保留按下时冻结的rackTop和预览；基于新桌面命中测试和旧边界释放可能造成误操作。实际Chromium/WebKit×667/844/1440的窗口缩放6场景RED，均因变化后旧drag未取消失败，日志 `.local/audit/drag-environment-20261008/resize-red-r01.log`。

尺寸/方向/全屏变化取消当前手牌按压，清除选择、拖牌、落点并释放原pointer capture；通过ResizeObserver覆盖无window resize的牌桌容器变化。只取消正在进行的按压；无活动指针时不影响普通选择。监听和观察随房间/挂载清理；不发任何游戏命令、不改规则、计分、输入阈值或相机。新一次按压重置点击抑制，可以正常继续出牌。

缩放修复后6/6；方向/容器尺寸/fullscreen事件三组各6/6，均检查旧手势不出牌、新一次按压能提交精确合法Choice并驱动原生弃牌；前者首次GREEN尚未包含重新按牌步骤，完整回归补覆盖。正式page.tsx CSS顺序。780本地测试与type-r02通过。完整浏览器120场景、生产build/secrets、独立审查、Linux和ECS发布检查待完成。

真实Android物理旋转/触摸及当前厂商视觉仍未验收；桌面模拟方向事件不能替代手机旋转。完整对齐目标保持active。

## 完整回归中的旧验证口径

第一次完整120场景：94通过/26失败，其中24拔北计数断言仍要求transform:none，两处opponentRack用牌架整体平面中心采样，实际落在实体牌之间的空隙。隔离已上线父版5707084对opponentRack原脚本重跑4通过/2同样失败，证明并非新取消逻辑引入。第二次修正朝向和真实命中后，升高牌面不在地面托盘四边形内的旧断言仍失败。

最终口径保留真实hit防误操作：先选取实际elementFromPoint命中对手牌架的实体牌面，取消/合法Choice不放宽。拔北计数允许现有正Z平移但必须保持本地XY单位轴与零XY平移；实体牌底座的实际地面投影须在托盘四边形内，升高牌面全角仍须在屏幕内、中心可命中，牌架/牌河不重叠检查继续保留。原有两轮失败完整保留；完整第三轮回归运行中，未宣称120项通过。产品仅增加取消旧手势，未改牌桌/拔北几何。

## 2026-10-08 final local regression and camera report

The actual r04 run completed with 120 PASS / 0 FAIL: `.local/audit/drag-environment-20261008/browser-full-r04.log`, `.local/audit/seat-drag-environment-final-1791444183542/proof.json`. The single reviewer found no Critical/Important cancellation-effect issue. The root fix pass makes opponent hit setup use native integer pointer coordinates, asserts selection clearing and capture release before pointer-up, and constrains all North local matrix components. Type checking after those changes and after the camera harness change exited 0. This is local evidence, not a new production release.

The user reports a parallelogram table. The camera harness now reads the actual page CSS imports. Twelve Chromium/WebKit sanma/yonma viewport scenes and 48 composited paint samples passed: `.local/audit/mahjong-camera-symmetry-20261008072654668/summary.json`. Chromium screenshots and WebKit screencast frames show a symmetric trapezoid. The WebKit Page screenshot path instead paints a skewed parallelogram and flattened standing tiles; this is reproduced locally but is not yet evidence of the user's actual browser or screen. No product camera fix is claimed. The parent-perspective probe failed and must not be applied. The translateZ(0) parent probe retained correct compositor frames but did not fix Page screenshot rendering. Both probes are test instrumentation only. The user's browser/device evidence is pending; do not deploy a speculative camera change or describe a screenshot-only rendering defect as a confirmed end-user runtime cause.
