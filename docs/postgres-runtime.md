# 本地 PostgreSQL 运行时

更新于 2026-09-23。本运行时只服务于 `couple-home` 的 macOS arm64 本地开发，不安装 Homebrew formula、不启动 macOS 服务，也不读取或修改其他 PostgreSQL 实例。

## 当前连接

```text
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/couple_home
binary_dir=./.local/postgres/bin
data_dir=./.local/pgdata
```

数据目录权限为 `0700`。服务只监听 IPv4 loopback `127.0.0.1`，不会监听局域网接口。开发实例使用 PostgreSQL `trust` 认证且不保存真实凭据；这个连接方式只能用于本机开发，生产部署必须另行配置密码和网络边界。

## 日常命令

所有命令都可以从 `couple-home` 目录执行：

```sh
scripts/pg-start
scripts/pg-status
scripts/pg-url
scripts/pg-stop
```

给应用进程设置连接字符串：

```sh
export DATABASE_URL="$(scripts/pg-url)"
```

`pg-start` 和 `pg-stop` 均可重复执行。首次启动时，`pg-start` 会初始化 `.local/pgdata` 并创建空的 `couple_home` 数据库。默认端口为 `55432`；如果端口已被其他进程监听，脚本会依次查找 `55433` 至 `55532`，并把实际端口原子写入 `.local/pg-port`。`pg-url` 始终根据这个记录返回当前连接串。

直接使用客户端工具时，把二进制目录加入当前 shell：

```sh
export PATH="$PWD/.local/postgres/bin:$PATH"
psql "$(scripts/pg-url)"
pg_dump --format=custom --file=/path/to/backup.dump "$(scripts/pg-url)"
```

## 二进制来源

安装的是 [Postgres.app v2.9.6](https://github.com/PostgresApp/PostgresApp/releases/tag/v2.9.6) 的 PostgreSQL 18 发行资产 `Postgres-2.9.6-18.dmg`，内部 PostgreSQL 版本为 `18.6 (Postgres.app)`。发行资产从项目 GitHub Release 下载，并在复制前核对发布 API 提供的 SHA-256：

```text
9fc7d0dc08cf46dfd94bb32cbaaad81b41b37847a42d6dcb2f9fbd292813defb
```

只复制了 `Postgres.app/Contents/Versions/18` 到 `.local/postgres`；没有把 App 复制到 `/Applications`，也没有运行其菜单程序或登录启动项。原始、已校验的 DMG 保留在 `.local/downloads/`，方便复核来源。

前置调查也核对了 `@embedded-postgres/darwin-arm64@18.4.0-beta.17`。该 npm 平台包只包含 `postgres`、`initdb` 和 `pg_ctl`，缺少本项目验收要求的 `psql`、`pg_dump` 与 `pg_restore`，因此没有用它拼出一个不完整运行时。

## 实际验证记录

验证时间：2026-09-23 00:41 CST，平台为 macOS arm64。可复跑验收：

```sh
scripts/pg-runtime-test.sh
```

该脚本执行以下真实操作：

1. 检查 `postgres/initdb/pg_ctl/psql/createdb/dropdb/pg_dump/pg_restore` 均可执行。
2. 通过 TCP 连接 `couple_home`，执行 `select version()`，并断言服务端地址为 `127.0.0.1`。
3. 建表并插入一行，停止并重新启动数据库，再读取同一行，验证 `.local/pgdata` 持久化。
4. 用 custom format 执行 `pg_dump`，创建 `ch_runtime_restore_<pid>` 空数据库，执行 `pg_restore` 并读取恢复行。
5. 删除测试数据库、测试表和 dump 文件；不删除或修改其他数据库。

本次实际输出：

```text
version=PostgreSQL 18.6 (Postgres.app) on aarch64-apple-darwin23.6.0, compiled by Apple clang version 15.0.0 (clang-1500.3.9.4), 64-bit
server_addr=127.0.0.1
restart_persistence=ok
dump_restore=ok
database_url=postgresql://postgres@127.0.0.1:55432/couple_home
```

另用临时监听进程占用 `127.0.0.1:55432` 后运行 `pg-start`，实际选择并记录 `55433`；释放冲突后已恢复默认 `55432`。最后复查结果：

```text
current_database=couple_home
listen_addresses=127.0.0.1
port=55432
temporary_ch_databases=0
status=running
```

`pg-runtime-test.sh` 会短暂停止和重启这个开发实例；应用正在执行写入或迁移时不要并行运行该验收脚本。
