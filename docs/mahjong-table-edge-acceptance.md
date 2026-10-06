# 外沿手牌与紧凑玩家卡验收

日期：2026-10-07。产品源码 `84a30ea54f2ef120cb9b463845ddd991f519173f`，Build `Hx371p-jEtEW2Oh7GCixJ`。已实际发布到 https://8.133.186.15/mahjong 。完整对局体验目标仍 active。

## 本次修改

按[官方操作指南](https://mahjongsoul.com/startguide/)及[发行方 Google Play 整桌画面](https://play.google.com/store/apps/details?gl=TW&hl=zh&id=com.soulgamechst.majsoul)观察，将两侧手牌从桌宽22%/78%移至12%/88%的外沿区域。参考像素只保存在忽略目录；产品继续使用授权的标准日本麻将牌面、原创牌桌与头像。

头像姓名卡改为56–84px紧凑竖排，头像32–48px，名字至少10px并省略过长内容。分数集中在已有场况台。副露查看按钮至少44px，整个按钮矩形处于牌桌内且可点击。本家和对家卡调整到边缘，避免遮挡手牌。

侧家牌背与副露一起缩放并保留比例，牌架与北牌托盘采用固定50%纵向锚点，不随副露数量跳动；操作区放在本家手牌上方。拔北数量标签最低9px。累计北牌、刷新恢复、合法Choice生成按钮及连续飞牌逻辑保留。本次没有改变规则、牌山、隐藏信息或服务启动方式。

## 实际验证

- 根最初实际RED确认外沿位置偏内；移动后继续发现宝牌/HUD、头像卡及操作区遮挡。通过真实浏览器边界逐次修正，未降低遮挡断言。桌宽测量采用实际 `.mahjong-table`，`mahjong-board` testid属于整个game。
- 56项真实RiichiGame/SanmaGame初始发牌、七个viewer、四种横屏尺寸和两种浏览器全部通过。检验实体手牌/牌背数量、相对风位与分数方向、读数和名字字号、可见性及外沿区域。
- 32满牌河/四组副露压力布局通过，另24项部分副露检查通过：每家隐藏手牌数13−3×副露数，覆盖一至三组。没有使用13手牌加四副露的不可能同席占位冒充有效牌局。压力夹具只验证显示；静态布局不代替真实Socket对局。
- 9px北牌标签先实际RED，再GREEN；完整查看按钮44px尺寸、四角点击及桌内矩形通过。三个浏览器探针严格加载本次CSS；压力夹具补齐真实global border-box尺寸规则。
- 完整318项测试、39文件通过，最终使用maxWorkers=2；覆盖已有成员权限、并发、真实持久化和备份恢复。初次pg_dump PATH缺失已修正为本应用运行时路径；高并发与三套浏览器同时运行时出现一次ordering mock启动未就绪，单独13项及最终全套均通过，未修改测试逻辑或超时掩盖。
- 26浏览器回归通过，20真实Socket场景与6显示/API夹具；隔离数据库和附件已清理。98动效几何/边界通过。最终typecheck、生产build、360构建文件秘密扫描实际exit0。
- 根查看了最终667三麻与1440四麻WebKit截图。独立审查通过并核对五文件SHA；审查者只读检查diff、diff-check和已有截图，没有独立运行测试。唯一Minor是外沿区域断言容差可继续收紧；当前实际12%/88%锚点与参考观察相符，不宣称厂商精确像素相同。

## 实际发布与资料保护

镜像 `yougui-app:84a30ea-ecs` / `sha256:98ce56c092899b472216c66d0187de55334dd4863ccc70c7cc77b509c7e7cc99`，运行目录 `/srv/yougui/releases/84a30ea`。本机编译后ECS仅COPY构建Linux amd64镜像；406源码及482构建文件的完整路径集和SHA均一致。冻结tar.gz 60,761,789字节，SHA `76e84614b396927470176529e07f80bef2e63099261a65a1ae91eca13c0bacf4`。

原8个操作helper和受保护发布器摘要保持。发布前与冻结后均确认无活跃真人牌桌，未结束真人桌、未创建QA账号或会话。发布器实际exit0，入口限制恢复；公网默认TLS健康200，54资源SHA一致。12表摘要从初次readiness到发布后完全不变，3账号、3原会话及28照片保留；原照片清理容器CID及镜像不变。应用1CPU/768MiB且无OOM，备份timeractive。

新鲜一致备份 `20261006T225709Z-025d388e0f0b`：29文件137,443,711字节。站外tar已实际下载并检查COMPLETE与全部29成员SHA，137,512,960字节，SHA `0b07c801bed0900a2c11f7e4cd2dc3899105086fb28d481ff9e81184bd2ef54f`。只保存于应用数据备份目录，文件0600、父目录0700。主目录同步范围限定七个owned路径，需核验405个其它文件、主目录索引及next-env原样；最终结果保存于`.local/ecs-deploy/edge-primary-sync-proof.json`。

## 仍待完成

完整参考动效时序、所有特殊副露/摸牌状态、整体透视构图及真实Android尚未验收。公开发行方回复确认开局固定牌山和牌谱底部SHA256入口，仍未提供哈希输入、编码、盐或RNG。本轮正常公开视频能播放，但采样含缓冲/宣传转场，不能用于厂商实局逐帧时长判断。230ms飞牌和900ms反馈仍为本产品参数。

证据：`.local/mahjong-edge-final-source-proof.json`、`.local/mahjong-table-edge-review.md`、`.local/mahjong-edge-public-independent.json`、`.local/ecs-deploy/edge-offsite-proof.json`、主目录`sanma-edge-*.json`。完整目标保持active。
