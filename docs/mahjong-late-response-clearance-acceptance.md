# 晚局多响应布局验收与发布

2026-10-08。以下本地候选记录为历史阶段；最新运行源d124f1b已发布，以末节为准。用户设备偏斜与真实Android仍待验证，全体验目标保持active。

## 复现与修正

原生引擎真实进行12/14轮摸切后，本家碰牌，再响应p3时合法提供荣和、三种吃、碰、明杠和过。已发布的单行响应区遮住本家多行牌河。首次分区试验又遮住对家牌河，后续测量还发现左侧暗手和加杠上层牌被遮挡，失败日志均保留，未将它们计作通过。

在高度不超过600px的横屏、本家存在副露且有合法响应的过按钮时，将碰与荣和/过置于左侧两排，明杠置于右侧并保留加杠上层牌的空隙。吃的所有组合预览继续在上方。按钮触控尺寸、合法Choice和牌面预览保持；相机与服务端规则未修改。该定位是有限设备场景验证，不能推出所有屏幕均已验收。

测试物理牌池排序，晚局本家摸切排除会造成振听的牌；加杠补牌预留实际s1。全部弃牌通过真实引擎操作产生，没有手工填充公开牌河。原先随机牌池曾产生合法振听而没有荣和，属于测试构造问题，已修正而非更改产品规则。

## 当前证据

正式页面CSS顺序，Chromium/WebKit × 667×375、844×390、1440×810、960×540、1440×540 × 碰/加杠 × 0/12/14轮 × 上家/非上家弃牌，120场景正常exit0。上家弃牌原生提供荣和、三种吃、碰、明杠、过；非上家提供荣和、碰、明杠、过。每个按钮至少44px、位于视口内、中心和四角命中，按钮矩形与全部牌河/暗手/副露/HUD零交叠。证据含CSS与测试SHA。最后两种尺寸补上短高度桌面窗口；只有不匹配短横屏媒体查询的桌面保留既有布局。

- 0轮，非上家，牌河数量[2, 2, 2, 1]：`.local/audit/mahjong-native-response-clearance-r0-across-added-1791452120904/legal-results.json`。
- 0轮，非上家，牌河数量[1, 1, 1, 0]：`.local/audit/mahjong-native-response-clearance-r0-across-pon-1791452120904/legal-results.json`。
- 0轮，上家，牌河数量[3, 2, 2, 2]：`.local/audit/mahjong-native-response-clearance-r0-upstream-added-1791452120904/legal-results.json`。
- 0轮，上家，牌河数量[2, 1, 1, 1]：`.local/audit/mahjong-native-response-clearance-r0-upstream-pon-1791452120904/legal-results.json`。
- 12轮，非上家，牌河数量[14, 14, 14, 13]：`.local/audit/mahjong-native-response-clearance-r12-across-added-1791452133555/legal-results.json`。
- 12轮，非上家，牌河数量[13, 13, 13, 12]：`.local/audit/mahjong-native-response-clearance-r12-across-pon-1791452133576/legal-results.json`。
- 12轮，上家，牌河数量[15, 14, 14, 14]：`.local/audit/mahjong-native-response-clearance-r12-upstream-added-1791452133555/legal-results.json`。
- 12轮，上家，牌河数量[14, 13, 13, 13]：`.local/audit/mahjong-native-response-clearance-r12-upstream-pon-1791452133555/legal-results.json`。
- 14轮，非上家，牌河数量[16, 16, 16, 15]：`.local/audit/mahjong-native-response-clearance-r14-across-added-1791452089137/legal-results.json`。
- 14轮，非上家，牌河数量[15, 15, 15, 14]：`.local/audit/mahjong-native-response-clearance-r14-across-pon-1791452089096/legal-results.json`。
- 14轮，上家，牌河数量[17, 16, 16, 16]：`.local/audit/mahjong-native-response-clearance-r14-upstream-added-1791452089234/legal-results.json`。
- 14轮，上家，牌河数量[16, 15, 15, 15]：`.local/audit/mahjong-native-response-clearance-r14-upstream-pon-1791452089150/legal-results.json`。

最终120场景索引 `.local/audit/late-response-root-final-r07-index.json`。最终修正后110副露、24操作、生产构建、类型和374文件秘密扫描正常exit0。完整测试r02中启动测试发生20秒超时（779/780），保留失败日志；单独8.30秒通过，同一源码再运行完整r03为780/78正常exit0。并行负载可能有关但根因未完全证实，未修改测试超时或产品启动逻辑。最终日志：`.local/audit/late-response-{meld,action,build,secrets}-final-r02.log`、`late-response-type-final-r03.log`、`late-response-full-final-r03.log`；失败为full-final-r02，单独测试为wake-isolated-r01。

## 边界与下一步

一次独立全阶段审查完成：Critical0、Important1（没有吃时仍遮住对手暗手）、Minor1（短桌面媒体查询范围未验证）。根一次修正把避让从存在吃扩展到响应的过按钮，并补上原生非上家响应及短桌面验证。120场景已通过；不同副露数量、其他屏幕尺寸及实际Android不能据此宣称通过。当前本地候选已完成上述检查，没有发布、同步主目录、操作业务数据或创建备份。审查发现的问题由根任务统一修正，不重复审查同阶段。


## 同一确定性牌局与父版对照

`.local/audit/late-response-parent-comparison-r01.tsx`保持当前实际引擎及确定性物理牌序，仅从Git读取父版119ef4的standing-tile CSS；其余正式页面CSS保持。上家与非上家14轮各10场景均实际exit1，失败属于信息遮挡断言，非fixture断言。比较用探针独立保存自身SHA及cssParent；索引`.local/audit/late-response-parent-comparison-r01-index.json`。与最终r07当前CSS的120场景通过构成同牌局前后对照，未暂时覆盖产品源码。


## 实际发布（2026-10-08）

运行源d124f1bfec3b46ea4868d7919af98acf317cd578 / Build7sysnizZ1XP01hLiOkrrH / 镜像sha256:fd3bba9b708422df510814a69fb9093712334ba0b1f62e5451af51003e9d9dfd。600源码/449 Next文件摘要全匹配；实际Linux263/16正常exit0。构建与Linux的初次状态为running，后续只查询同一PID，未重复启动。

发布确认没有真人牌局、实际exit0、入口屏障恢复，health200。默认可信TLS130公网资源摘要全部匹配；12业务表发布前后摘要保持，清理CID/镜像与1CPU/768MiB限制保持；禁备份标记、masked/inactive状态及备份目录不存在保持，没有创建备份或下载用户资料。6所属源码路径保护同步成功，以主目录606个既有文件为保护基线，仅更新所属路径；其他文件、HEAD/索引/next-env及其他状态保持。

120原生布局场景、110副露、24操作、780本地与263Linux验证通过。一次独立审查及根一次修正，无第二次审查。详情见[发布测量](measurements/mahjong-late-response-clearance-published-2026-10-08.json)。其他副露数量、真实Android与用户设备偏斜仍未完全验收，整体目标active。
