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

## 双击初版交付范围

运行版本2bcc07601b31c130f2e415a51d22aa7a9773b458 / Build _i9aj6L_IVuNMOBo2EqSP已发布到https://8.133.186.15/mahjong。代码提交已推送GitHub main和工作分支；本发布记录也立即提交推送。

冻结镜像sha256:ebaf4559fda36ac188423f84f8d3077fb1449663122290fb6fb215546101bcac的663份源码、449份构建文件摘要一致，继承原依赖层。隔离Linux容器0.5CPU/384MiB、原生单worker配置下539项/35文件全部通过；实际exit0，未将运行状态或观察超时算通过。发布屏障内确认无活动真人牌局后切换，健康检查通过并恢复入口。13个远端阶段实际终态通过；默认可信TLS公网健康200与133份资源摘要匹配，12张表发布前后摘要一致（9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41）。应用1CPU/768MiB、清理器实例及镜像不变，禁备份标记与masked/inactive状态保持，未建立备份或下载真实用户资料。完整终态核对保存在.local/ecs-deploy/blank-published-closeout-r01.json。

浏览器测试通过桥接回调把UI选择交给原生引擎，HTTP/生产账号/TLS/WSS不包含在本步144场景中。真实Android、生产网络失败/重连的完整手势验收和完整当前厂商体验继续待验证；原完整目标active，未缩小为本次快捷操作。


## 失败请求后的明确重试（2026-10-09，本地候选）

网络失败曾让双击快捷操作在同一决定永久保持consumed：手动点牌恢复后，重新双击仍无回调。控制器与正式Root分别取得真实RED（blank-recovery-red-r01.log、blank-recovery-root-red-r01.log）。新增显式恢复代次，仅在respond失败后、成功GET被原有响应排序接受、该对象仍是当前状态、房间/游戏/手局/席位/决定相同且原Choice仍有效时递增。恢复清空旧手势与consumed，必须重新双击；忙碌解除本身、GET失败、过时GET、已移除选项不解锁，也不自动补发。新游戏仍沿原scope正常初始化，不把新游戏当旧决定重试。

正式Root组件覆盖失败POST后成功GET、GET也失败、选项消失、新游戏以及GET晚于更新Socket五种分支；控制器证明单纯busy解除不解锁、明确恢复不重放旧输入。本轮测试使用模拟HTTP/Socket与原生物理引擎初始化视图，不能代替实际HTTP网络、生产账号WSS或真实Android。本段为发布前候选记录；真实网络及Linux发布已完成，最终状态见文末，完整对齐目标保持active。


最终代码完整978项/92文件、类型检查、生产构建及374文件凭据扫描实际exit0，证据blank-recovery-full-r02.log、blank-recovery-type-r02.log、blank-recovery-build-r01.log、blank-recovery-secrets-r01.log。中间类型检查发现nullable room，补充显式非空检查后重跑通过；中间测试误把新游戏初始化当旧决定去重，修正测试预期（新游戏本就应允许明确操作），没有改产品scope。

原144原生浏览器回归在最终产品源码下全部通过（blank-recovery-browser-r01.log / .local/audit/blank-table-browser-1791495936490/proof.json），Chromium/WebKit、三四麻、两横屏、mouse/touchscreen输入保持合法精确弃牌与默认关闭，结束后再次核对所有源摘要。此144仍是GameRoom桥接引擎，不含本次Root失败HTTP实际传输；失败恢复的Root覆盖由组件测试证明。最终63项定向检查通过，根非独立复核blank-recovery-final-review-r01.json。


## 真实HTTP与Socket恢复验收（2026-10-09）

正式MahjongClient/SessionProvider/apiRequest、真实本地HTTP和Socket.IO、正式RoomStore.execute幂等及物理108/136张引擎：Chromium/WebKit × 三四麻 × 两横屏 × WebSocket/polling × mouse/touchscreen × 摸切/pass × 五种故障次序，共320唯一场景全部实际exit0。五种分别为首次POST未执行即503、POST及重读GET均503、原生已执行后响应连接断开且Socket先到、原生已执行后连接断开且Socket后到、重读旧GET晚于新的Socket版本。没有替换浏览器fetch结果、force点击、假时钟或放宽超时。

共256个原生接受操作；同一决定最多一次，POST逻辑提交448次（包含初始明确手势和明确重试/下一回合），无自动补发，最多一个在途。明确拒绝后成功重读才可重试；GET也失败及旧GET被排序拒绝保持去重。已成功弃牌后不再提交旧决定；已成功pass后轮到自己摸牌，则先等实体入手完成，再允许用户重新双击切当前精确摸牌，这是新决定而非重复过牌。鼠标和触屏都从elementFromPoint证实的真正空白桌布操作。

首个脚本因浏览器对断开连接用相同nonce重传而失败；原简化服务误将传输重试当新操作。替换为正式RoomStore（通过正常create/join/ready/start注入物理引擎），相同nonce只查询现状、不再次执行。第二个脚本误把pass后新摸牌决定也算旧操作，修正测试为每个原生决定最多一次，并核对第二次确为新决定及当前摸牌Choice。两份失败证据blank-recovery-network-r01.log/r02.log保留，产品代码未因测试假设更改。最终blank-recovery-network-r03.log及.local/audit/blank-recovery-network-1791496342222/proof.json，结束后源摘要全核对一致。

当前受限Linux选择在本机同一单worker/threads/isolate配置下545项/35文件通过，类型检查通过，根非独立复核于.local/audit/recovery-final/review.json。上述选择结果仅是本机证据，ECS实际终态见文末；账号会话由测试HTTP端提供，不能证明生产账号权限/TLS/WSS或真实Android。网络验收提交已推送，发布最终状态见下方。


## 恢复版本正式发布（2026-10-09）

运行3205c63c181a44b32426194fb12b9e9377cbad5f / Build wxz_uK5KxqUXj9IPPPaNw已上线https://8.133.186.15/mahjong。镜像sha256:71ec3aa59c08272842b920ab1832625f51f91b4f5bd0a6da139a279f32d37710，发布manifest摘要4bc3b76dfe31e31bb4239f82df34d2f2857d23204c428431e6f35c7b42be8134。664份源码与449份构建逐文件一致，继承已验证父依赖层，未改相机、规则、持久化或凭据配置。

首轮Linux545/35测试本身通过（238.21s），但容器退出收尾触及整条任务240s监督上限，实际exit124；该轮保留为失败，未拿计数通过放行。只读检查确认原PID已停止、容器已移除后，以同一镜像、0.5CPU/384MiB、单worker/threads/isolate和原120s测试/hook时限重新检查；只把整条任务监督上限设为360s。第二轮545/35全通过（233.80s），任务实际exit0，终态来源late-response-3205c63-r11-linux-status.json，未把运行状态或观察超时当成功。首次临时终态复核对Docker错误文本大小写的假设失败也保留，实际只读State检查证实移除后才启动新任务。

固定发布器屏障内排空请求并确认无活动真人牌局后切换，镜像健康通过、入口恢复，发布进程实际exit0。13个远端阶段终态核对通过（采用第二轮Linux），默认可信TLS公网健康200及133份资源摘要一致，12表发布前后摘要相同（9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41）。应用1CPU/768MiB、清理器实例和镜像不变；禁备份标记及masked/inactive策略保持，未建备份或下载真实用户资料。完整闭环证据.local/ecs-deploy/recovery-published-closeout-r01.json。

代码及每次完成的验收提交均已推送GitHub main与工作分支，发布记录也立即提交推送。本次证明快捷操作失败恢复的本地真实HTTP/Socket和ECS运行发布；真实Android、生产账号WSS故障交叉和完整当前厂商画面/语音/全部交互仍未全验收，原完整对齐目标保持active。
