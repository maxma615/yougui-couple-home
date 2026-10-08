# 自动操作联机与补牌时序（2026-10-09）

上一步便捷开关已发布89f9464。其浏览器证明使用GameRoom桥接原生引擎，未覆盖正式Root、HTTP请求与Socket同时送达。本轮新增实际本地HTTP/Socket.IO联机验证，并修正由此发现的自动拔北跳过补牌展示。

## 已复现问题与修正

测试在真实fetch发送前记录生产DOM的隐藏补牌及入手标记。修正前连续三次拔北中，第二次请求`held:true`，第三次`held:true,arriving:true`；新决定已经合法，但补牌尚未可见，自动任务便再次提交，打断当前实体动作。

GameRoom现在把自动操作的就绪条件同时接到既有useNukiMotion.heldDecisionId和useDrawArrival.arriving：拔北落地并解除隐藏、补牌入手阶段结束后才执行下一自动操作。没有添加猜测动画时长、规则字段、服务器推演、POST队列或自动重试；复用现有状态及取消逻辑。手动操作仍能主动结束既有动作。换决定、断线/后台及busy仍按已实现的控制器清理。

## 本轮验证

- 修正前`automatic-network-presentation-red-r01.log`实际退出1；对应失败JSON保留三次原生合法POST及发送前DOM标记，不用截图或计数猜测隐藏问题。
- 修正后正式MahjongClient/SessionProvider/apiRequest、本地真实HTTP和Socket.IO、物理108/136张原生引擎，Chromium/WebKit × 三/四麻 × 667×375/1440×810 × WebSocket/强制轮询，包含自摸、荣和、不鸣牌、精确摸切、立直阻止摸切和三麻连续拔北，共88场景实际退出0。
- 667宽场景服务端先发送两份同版本Socket状态，等待200ms再完成HTTP响应；1440宽场景先完成HTTP，200ms后发送两份Socket状态。两种次序按视口划分，不声称每个视口均交叉测过两种次序。未修改浏览器时钟、force点击或放宽超时。
- 共88个实际原生接受的HTTP指令。逐场景nonce/decisionId唯一、最多一个在途POST；三次拔北分别属于新决定。发送前fetch只做同步DOM记录，仍直接调用真实fetch；每次自动拔北发送前`held:false,arriving:false`。最终公开北计数3且显示三张北；自摸/荣和进入原生结算，不鸣牌不产生副露，摸切正确`s2_`，特殊自家选项零提交。
- 单独在合法荣和时先启用“不鸣牌”，等待850ms确认零POST且荣和仍可点，再开启自动和牌，由引擎接受。重复Socket/GET及迟到HTTP没有造成重复指令或回退。
- 当前修正源码再跑36场景原GameRoom桥接浏览器，包含实体摸切来源几何、菜单44px/视口内、连续北计数、特殊选择零提交，实际退出0。
- 完整949项/90文件、类型、生产构建、374构建文件凭据扫描及diff检查均实际退出0。没有规则/协议/权限/数据迁移变更，既有权限和并发测试包含在完整检查中。

网络最终证据`.local/audit/automatic-network-1791489809039/proof.json`，桥接最终`.local/audit/automatic-browser-1791489880430/proof.json`，均绑定各自脚本、Root/控制器/选择器、会话/API、原生引擎/夹具、CSS/字体及bundle，结束再次核对当前源码一致。既有补牌两hook仍等于父提交的完整字节，摘要另记`.local/audit/automatic-presentation-final/review.json`。根复核非独立审查，无未解决Critical/Important；没有据软件截图修改相机。

保留首次联机r01失败：九个场景已通过后，Chromium三麻667轮询荣和场景的真实点击在scroll-into-view阶段30秒超时，服务端零误提交、无页面错误。没有足够证据定位成产品遮挡，带截图/点击区域诊断的r02完整88通过，实际查看菜单与荣和/碰/过均可达；首次失败和诊断不删除，未宣称修复了未知设备问题。随后新增补牌发送前检查取得有效RED，修正产品后完整最终88通过；桥接/类型/构建/完整测试也按最终源码重跑。

## 范围与发布状态

本地服务端返回合成member会话，Next导航为稳定桩；HTTP/Socket确实运行，但不是正式生产账号权限、TLS/WSS或Android实机验收。浏览器中的DOM隐藏/入手标记证明生产阶段门控，不等于已逐帧比对当前雀魂或验证真实手机输出。当前厂商完整视觉/角色音声/私有协议及整体体验目标仍未完成。

本步代码与证据已提交推送GitHub main和麻将工作分支，ECS现已发布fef6e66；同一冻结镜像Linux、发布屏障、公网及运行策略复核通过，详见下节。真实Android与完整厂商体验等原范围继续待验收，整体目标active。


## ECS实际发布（2026-10-09）

- 入口：https://8.133.186.15/mahjong。运行源`fef6e66eca66e0985fd5a63a2b9ed41bf946f38b`，Build `SyqNXitxCD_KjJQ7Iwn4g`，镜像`sha256:fe16151ce0695eda67654f703b8c2f0fa275aa9f4058a2682e170ee090804ca3`。
- 新鲜父版本89f9464全摘要/固定检查器/清理器/禁备份预检通过。冻结包37315862字节SHA256匹配，候选继承已核对父镜像层，656份源码及449份Next产物全摘要一致；冻结清单同时绑定网络88与桥接36场景。
- 本地与同一Linux镜像502项/31文件实际退出0，精确文件/断言数及源/Build/image身份一致。原生配置threads/isolate:true、单worker、0.5CPU/384MiB、无网络只读/64MiB临时目录、单项/Hook120秒和整个240秒不变；仅轮询原PID1468798，未将running当成成功或重启。
- 六个发布阶段命令复核最初使用裸数字子串检查，被新镜像哈希中的67654f误触发；修正为完整数值边界检查后全通过，实际阶段命令未改。误报时仅暂存源码，尚未切换；随后正常执行就绪及发布。复核记录`.local/ecs-deploy/presentation-command-review-r02.json`，没有放宽来源/image/Build/清单/资源/策略检查。
- 固定发布器实际exit0；屏障内原生确认无真人活动牌局，切换后内部健康通过、入口恢复。默认可信TLS公网健康200，133公开资源摘要一致；最终应用Running、无OOM，1CPU/768MiB。
- 12张业务/迁移表发布前后摘要一致`9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`，用户7/空间3/成员5/照片29/迁移7；照片清理器CID及镜像保持。禁备份标记、timer masked/inactive、service inactive和三个不存在的备份路径保持，没有创建备份或下载真实资料。

发布闭环`.local/ecs-deploy/presentation-published-closeout-r01.json`绑定13个终结成功阶段、公网133资源与同一冻结清单`af1296830d45390ac6772dbef4c9b675139a74984a0a7d032b4a23b7336dc0f9`。发布记录立即提交推送GitHub两分支。公网资源身份/健康验收不能替代正式生产账号/WSS端到端自动操作或Android硬件验收，原完整体验目标继续active。
