# 手机模拟中的原生触摸拖牌验证

日期：2026-10-09。连续目标保持active。本步新增浏览器验收，没有改变产品源码或线上镜像；线上仍为d55b35f／Build hkYXOsOKAt0TWe8Q0Nrmk。

Chromium原生CDP输入在手机模拟上下文中执行36场景：三/四麻 × 667×375、844×390、915×412 × 有效拖出、拖回、12像素微移、恰好20像素、触摸取消、断线。使用触摸能力、移动视口、DPR2或3以及Android风格User-Agent；这不等于真实Android或该User-Agent所写版本的Chrome实机。

正式GameRoom、应用CSS和真实引擎合法手牌接收输入；原生Input.dispatchTouchEvent产生的pointer事件均为isTrusted且pointerType为touch，并实际出现pointercancel。CSS触摸手势为none，coarse媒体查询与实际视口宽度已核对。按住不提交，超过门槛后的有效桌布松手才提交一次正确选择，且带有实体牌起点和决策身份。12与20微移、拖回、取消、断线时均不误出牌，预览与目标标记最终清除。

另在18个拖回/取消/断线场景中验证取消后没有残留选牌；断线恢复后或取消后，新的首次点按只选牌，第二次才提交一次正确选择，没有继承旧确认资格。

最终原生进程退出0、36场景和最终类型检查通过，未发现产品缺陷。本步只新增验收脚本及文档，未重复宣称完整1084检查、ECS669检查或既有浏览器矩阵在本步重跑。

初轮36场景仅验证误出牌与预览清理，日志touch-drag-native-r01.log保留；增加新点按确认检查后，r02在断线场景失败：探针使用:enabled定位，被禁用的同一张牌不再匹配，因而等待超时。修正探针为稳定data-hand-instance-id后，r03全场景通过，没有因此修改产品或放宽行为断言。r02不是产品RED证据。

最终证据在应用忽略目录 `.local/audit/touch-drag-browser-1791509030951/{proof.json,current-source-audit.json}`，日志为 `.local/audit/touch-drag-native-r03.log`，类型为 `.local/audit/touch-drag-type-r03.log`。所有声明的源码和CSS摘要与当前文件一致。根任务检查不称为独立审查；手机模拟截图不代替真实触屏、GPU或厂商逐帧对照。

真实Android屏幕方向、系统手势、真实浏览器版本和整机性能仍待验收；本机没有找到adb工具。未改动运行服务、真实用户资料、规则或计分，未生成备份或下载真实资料。整体体验仍未全部对齐。
