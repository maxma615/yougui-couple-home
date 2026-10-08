# 手机横屏提示与全屏生命周期

2026-10-08，已实际发布源码 `8dd5182` / Build `pdkOlgPZWiQsgE294wFXe`。本次修正两个实际复现的问题：自动方向锁不受支持时，手机已经手动横屏仍保留“请旋转手机”；用户退出全屏后，组件保留旧全屏归属，可能在离开牌桌时退出后来由其他功能开启的全屏。

`useTableScreen` 现在依据实际横屏 media query 清除提示，已经横屏时不显示旋转提示；监听全屏退出/转移并释放本牌桌持有的方向锁。离开牌桌只退出自己请求的全屏，保留原已存在的全屏；异步方向锁晚返回时再检查进入时的全屏会话，退出期间不残留方向锁。竖屏自动横屏失败时保留有用提示，原横屏入口、竖屏遮罩和牌局数据不变。

## 实际验证

- 9个新的生命周期测试通过，覆盖手动旋转、已横屏的失败、全屏退出/转移、原有全屏、重复请求、离开期间晚返回的全屏和方向锁。
- 4个生产GameRoom实际React浏览器场景通过：Chromium/WebKit，375/390宽的触摸视口，竖屏请求失败→实际改变视口横屏→再次点击入口→回到竖屏→解散退出。原生四麻手牌数量保留，提示清除、最后全屏释放，没有浏览器错误。Fullscreen/Orientation API结果在这4例中用边界桩控制，viewport和media query是真实浏览器行为；不代替Android硬件方向锁验收。
- 最终整套794/80测试通过，类型、生产构建与凭据扫描通过。包含真实PostgreSQL权限、并发、持久化等回归。
- 根任务审查：事件监听在卸载移除，未加入轮询；只清除已过期提示，真实竖屏失败提示保持；仅释放自己持有的方向锁/全屏，异步晚返回有再检查。没有未解决Critical/Important；非独立审查。

本地证据 `.local/audit/table-screen-*`：RED中4/8失败，修正后最终9/9；`table-screen-browser-1791467601505/{manifest,results}.json` 4例最终源码摘要；`table-screen-full-r03.log`794通过。生产构建`table-screen-build-r01.log`；类型`table-screen-types-r02.log`；凭据`table-screen-secrets-r01.log`。

失败保留：首次完整回归中本机测试PostgreSQL未运行；恢复所属小屋数据库后，旧组件测试默认横屏却断言旋转提示失败。该测试补齐实际竖屏边界，未删掉断言、跳过数据库或放宽时间，再完整运行r03通过。浏览器脚本初次整理缺少tsx辅助函数且类型将fullscreen误推断为null，修正后最终4例通过。

服务器父版本28431a5先只读核对614/449文件。冻结候选后，Linux277/18实际通过；源619/构建449全部摘要及公网默认TLS133资源核对一致。发布器实际退出0，确认无活动真人牌局，入口屏障恢复；12张业务表摘要仍为 `9a1223afc6951979ded1c169c5fa2ff3220f188236cc55a0ff3e15e4af316a41`，清理器身份及禁备份策略保持，没有创建或下载备份。最终健康检查通过，应用1CPU/768MiB不变。6所属路径同步主目录，保护其HEAD与索引；提交8dd5182已推送GitHub main和麻将分支。

发布证据 `.local/ecs-deploy/screen-published-closeout-r01.json`、`late-response-remote-captures/late-response-8dd5182-*.json`、`late-response-8dd5182-r01-public-proof.json`。镜像 `sha256:fcb2efa055b20acce09db1f99fedc27ed1a47b82f0e074d25030585a55e0798f`；工件清单SHA-256 `3407a48af8514eafc57c388ea6d054ccb57845e168c171045cdf372e657e113a`。Linux两次观察仍在运行，第三次同一PID实际完成；没有重启任务。Upload CLI输出不是单一JSON，解析诊断失败保留，实际上传退出0后远端校验37,218,956字节及完整摘要通过。

真实安卓、用户设备桌面偏斜及完整厂商体验仍待验收，整体目标继续执行。
