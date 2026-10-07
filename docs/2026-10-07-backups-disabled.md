# 2026-10-07 关闭备份与空间回收

用户澄清：不需要备份，不要下载到本机。此前“搬到 Mac 并继续备份”的方案已取消，不建立本机备份自动化。开发代码与线上业务资料分开保存；以后是否重新备份以用户新的明确授权为准。

## 已执行操作

- 目的地为已授权上海 ECS `i-uf6i9ie15g82dprialoy`；没有操作学术工作台。
- 停止并禁用原每日备份，`yougui-backup.timer` 已 masked；原 service 保持 inactive，并添加持久条件 `ConditionPathExists=!/srv/yougui/config/backups-disabled`。
- `/srv/yougui/config/backups-disabled` 位于配置目录，跨发布保留。备份 service 入口与 Compose 包装脚本加入策略检查；应用目录 `AGENTS.md` 记录最新约定。
- 按用户指令删除 ECS `/srv/yougui/backups`、`/srv/yougui/album-backups` 与取消搬运时产生的 `/srv/yougui/.backup-transfer` 暂存。
- 用户澄清前，临时当前快照已完成、网站已恢复；该快照随暂存一并删除。没有执行备份下载，也没有创建本机自动化；取消的传输工具已从本地开发暂存目录移除。
- 不删除数据库卷、附件卷、本机原有历史文件、运行镜像或回滚发布版本。

## 实际验证

- `df -Pk /`：操作前 used `37442932` KiB、available `1568012` KiB；清理后 used `30023480` KiB、available `8987464` KiB。相对原磁盘状态释放约 7.08 GiB；当前 `df -h` 为 29G used、8.6G available、77%。
- 三个备份/暂存路径均不存在；定时器 masked、service inactive，`list-timers --all` 无有归备份条目。
- HTTPS `/api/health` 返回 `{"status":"ok"}`；应用、照片清理、网关正在运行，数据库 healthy。
- 实际存储校验：29 张有效照片，待清理、未知孤儿、断裂引用、哈希不符均为零。当前数据库记录 7 个账号、3 个空间、5 条成员关系、29 张照片；这是清理后的现场计数，不假定其他正在运行任务没有更新数据。
- 附件卷约 132 MiB、数据库卷约 89 MiB。只移除备份副本，未执行业务表写入或真实照片删除。
- `sh -n scripts/backup.sh deploy/backup-service.sh` 通过。本次只改变运维策略，没有重新构建或替换网站镜像。

原运维文档中的每日备份、站外复制与升级前备份条款均是历史方案，不得据此重新启用备份。系统盘仍存有旧镜像与构建层，本次未清理它们。
