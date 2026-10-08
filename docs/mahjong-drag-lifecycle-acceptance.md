# 切后台时取消旧拖牌手势（2026-10-09）

拖牌原先只在指针取消、丢失捕获或桌面尺寸改变时收回。窗口失焦、页面隐藏和离开页面不会主动取消已保留的手势，恢复后旧pointer-up可能提交出牌。本次让这些事件沿用现有取消逻辑：清空活动指针、拖拽预览、落点高亮与已有选牌，释放实际指针捕获，并抑制随后到达的旧点击。新一次按下仍可正常出牌。显示中的visibilitychange不取消手势。没有改动牌桌样式、服务器计役或结算规则。

## 验证

- RED：新增blur/pagehide/隐藏visibilitychange三项测试均失败，原有25项通过。修正后28项通过；使用三麻原生视图，旧松手与点击不发命令，新手势恰好提交一次合法弃牌。
- 完整920项、88文件实际退出0；类型检查、生产构建及374文件凭据扫描通过。
- Chromium/WebKit、667×375、844×390、1440×810，共24场景：18个中断及恢复、6个普通拖牌。正式GameRoom挂载、原生四麻完整牌墙；真实mouse/pointer capture与本地资源。中断后捕获、拖拽、落点和选牌均清空，旧pointer-up零命令；新press提交一次原生合法s1弃牌并由引擎执行成功。
- 失焦、pagehide与隐藏visibilityState在浏览器中由测试主动触发；不能代替Android系统真实切后台、触摸输入或设备恢复验证。
- 首次浏览器22通过、2失败，均为WebKit截图等待字体超时，尚未到达完整出牌断言。补齐测试站点本地字体路由，等待字体就绪后完整重跑24/24退出0，保留失败证据，没有更改截图超时或出牌断言。

证据：本应用忽略目录`.local/audit/drag-lifecycle-{red-r01,full-r01,type-r02,build-r01,secrets-r01,browser-r01,browser-r02}.log`。最终浏览器`.local/audit/seat-drag-lifecycle-1791484055208/proof.json`记录完整24行、当前源码/CSS/字体/夹具摘要与bundle摘要，运行结束再次核对源码不变。失败记录为同目录命名的`seat-drag-lifecycle-1791483809712/proof.json`，未作为通过依据。

## 当前状态

已发布ECS，公网运行`1b3f06037058e16d2183088f4661c3d4ee0e1bda`，Build ID `ZKSECNtC0GL8qnhmQ_H0Z`。当前厂商完整游戏体验、Android实机及用户原设备透视问题仍未完整验收，持续对齐目标保持进行中。

## ECS及公网发布实证

同一冻结镜像的460项/28文件Linux检查实际退出0；线程池、逐文件隔离、单worker、半核CPU、384MiB、只读且无网络，沿用240秒部署总预算及120秒单测试/钩子时限。发布器实际退出0，屏障下原生检查`authoritativeAbsence:true`、`checkedMembers:0`，切换后健康通过并恢复入口。

运行镜像`sha256:318b17fd54b22dcfc0a8af3c9d8fd5c830358748d27bc014d36a89a2edc50f4f`；646源码文件、449前端构建文件在冻结包/候选/运行镜像全摘要一致，公网默认TLS验证健康200、133项资源全摘要一致。12张业务表前后摘要均为`9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`；用户7、空间3、成员5、照片29、迁移7。照片清理容器及镜像身份不变，应用仍1核/768MiB，无OOM。禁用备份标记保留、timer masked/inactive、service inactive、备份路径不存在，未生成备份或下载用户资料。

冻结包37,291,435字节，SHA`df855935559716d560c83e9eab2493011ef0ae19dad5aedd5b15354f03786c70`；manifest SHA`af51d23dd12a3eda683aaae25ff3a0eae007523be0fef9251af8117c26e2f695`。忽略目录`.local/ecs-deploy/drag-lifecycle-published-closeout-r01.json`核对13阶段终态、公网133资源和最终健康绑定同一构建。本轮发布检查无失败重试；先前浏览器字体路由缺失造成的2项失败仍保留，未用来证明成功。
