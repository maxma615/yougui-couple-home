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

## 2026-10-08 发布验证

实际上线源 d8173733b402cbd418a175e40dd3a927bf11fa00 / Build omo_wr9qr5dVYXw96KCbz / 镜像 sha256:a542c7a5c715af384ba3b29dce74c5e82cd88571725310362dd9ed795952a218。COPY-only候选592源码和449构建文件逐项摘要通过，无服务器npm/Next构建。Linux第一次16文件263断言通过，但120秒执行上限导致真实退出124，发布门不通过；失败记录完整保留。确认终止且容器已移除后，以相同镜像、0.5 CPU/384 MiB、无网络、只读容器重跑，时限180秒，r08状态证明263/263且任务正常退出0。不能将第一次断言通过冒充完整成功。

发布器实际exit0且保护门恢复；权威无真人牌局检查通过。公网默认TLS health200，130资源SHA一致；上线592/449文件及manifest摘要一致，12业务表摘要发布前后为9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41。清理器CID/镜像与禁备份状态保持，未备份或下载用户资料。主目录7所属文件保护同步通过，598文件基线的其它字节/状态及HEAD/index/next-env保持。发布证据见[发布测量](measurements/mahjong-drag-environment-published-2026-10-08.json)。

本次修复显示几何变化时旧拖牌误提交风险。未修改相机，未宣称用户设备平行四边形问题已经修复，真实Android旋转触摸和厂商全体验仍未证明。连续目标保持active。
