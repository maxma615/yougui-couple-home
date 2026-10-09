<div align="center">

<h1>有归</h1>

<h3>两个人的日常，记在有归。</h3>

<p>私密、轻松、一起维护的线上生活空间。每个小屋只属于两位成员，资料由你们自己掌握。</p>

<p>
  <a href="https://github.com/maxma615/yougui-couple-home/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/maxma615/yougui-couple-home?style=for-the-badge&amp;logo=github" /></a>
  <a href="https://github.com/maxma615/yougui-couple-home/network/members"><img alt="GitHub forks" src="https://img.shields.io/github/forks/maxma615/yougui-couple-home?style=for-the-badge&amp;logo=github" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-B75B72?style=for-the-badge" /></a>
  <a href="https://nodejs.org/"><img alt="Node.js 24+" src="https://img.shields.io/badge/Node.js-24%2B-43853D?style=for-the-badge&amp;logo=node.js&amp;logoColor=white" /></a>
</p>

<br />

<table>
  <tr>
    <td><img src="docs/screenshots/calendar-chromium.png" alt="有归共同日历桌面视图，展示跨月旅行安排" width="820" /></td>
    <td><img src="docs/screenshots/calendar-webkit-mobile.png" alt="有归共同日历手机尺寸视图" width="250" /></td>
  </tr>
</table>

<sub>界面截图使用隔离测试账号与虚构日程；项目目前提供自托管代码，没有官方托管实例。</sub>

</div>

## 一起把日子过得有迹可循

有归把纪念日、共同待办、点滴照片和日历放进一个双人空间。两位成员使用各自账号，通过一次性邀请加入同一个小屋；新增和修改会同步给对方，发生并发编辑时会保留草稿，方便核对后再处理。

| 💞 两人共用 | 📅 一起安排 | 📷 留下点滴 | 🔒 自己掌握 |
| --- | --- | --- | --- |
| 独立账号，一间小屋最多两位成员 | 纪念日、待办、共同日历 | 私密照片和生活记录 | 自托管 PostgreSQL 与照片存储 |

### 让每天的小事都好找

- **共同日历**：全天跨日事项按包含结束日显示；带时刻事项统一按上海时间查看。
- **及时更新**：对方的修改会自动出现；网络中断时保留编辑内容，版本冲突可比较后重试。
- **私密邀请**：一次性邀请链接用于加入第二位成员；不开放第三位成员加入。
- **数据持久化**：生活记录与照片独立保存；代码提供备份恢复工具，当前自用实例按用户要求关闭备份。
- **独立运行**：与研笺学术工作台分开部署，不共享账号、数据库或资料。

## 当前功能与接手开发

仓库 `main` 包含当前全部应用功能：深色情侣空间、手机号/邮箱登录、双人成员邀请、纪念日、待办、日历、点滴照片、管理员面板和跨空间相册只读，以及日本三/四人麻将联机与电脑补位。麻将包含实体牌桌、上下文操作、拔北、副露、宝牌、拖牌、结算、原创音效与三款桌布。杭州/四川麻将仍待开发。

换设备请从[开发交接指南](docs/development-handoff.md)开始：包含克隆、数据库和环境配置、账号初始化、测试、代码地图、当前上线版本和后续待办。源码根目录即应用目录。

## 本地开发

需要 Node.js 24 或更新版本、PostgreSQL 18，以及同主版本的 `pg_dump` 和 `pg_restore`。

```sh
npm ci --cache .local/npm-cache
cp .env.example .env.local
```

在 `.env.local` 中填写数据库地址、绝对附件目录、`APP_ORIGIN=http://127.0.0.1:3000` 和独立的随机 `SESSION_SECRET`。然后运行：

```sh
npm run migrate
npm run init-admin -- --email you@example.com --display-name 你的名字
npm run dev
```

初始密码会在终端安全提示中输入，不要把密码写入命令行参数。`init-admin` 是历史命名，创建首位普通成员；独立管理员配置见开发交接指南。打开 `http://127.0.0.1:3000` 登录后创建小屋，并在设置页生成邀请链接。

## 自行部署

有归提供 Docker Compose 与 Caddy 配置。准备好指向服务器的域名和 80/443 端口后，在部署主机执行：

```sh
cp .env.compose.example .env
# 为 POSTGRES_PASSWORD 和 SESSION_SECRET 分别生成独立的随机十六进制密钥
docker compose up -d --build
docker compose exec app npm run init-admin -- --email you@example.com --display-name 你的名字
```

部署前在 `.env` 中填写 `APP_DOMAIN`、匹配实际访问地址的 `APP_ORIGIN` 和两份不同的随机密钥。不要提交 `.env`；Caddy 会为域名配置 HTTPS。备份、恢复、升级和故障处理步骤见[运维手册](docs/operations.md)。公网部署需要你自己的服务器与域名，本仓库不会创建或托管线上实例。

## 验收记录

当前运行版本 `0abd219` 的完整检查为 **1180 项 / 102 文件**，336 个原生浏览器及联机场景、类型与构建通过；ECS 同镜像受限 Linux 765 项通过，公网资源和健康状态已核验。真实安卓设备、完整参考体验及生产认证 WSS 故障仍未全部验收。较早记录保留历史范围，不代表当前总测试数。

- [最新开局验收与发布](docs/mahjong-round-opening-acceptance.md)
- [麻将功能进度与待办](docs/mahjong-fidelity-progress.md)
- [换设备开发交接](docs/development-handoff.md)
- [管理员与手机号账号](docs/admin-phone-acceptance.md)
- [管理员相册](docs/admin-albums-acceptance.md)
- [运维手册](docs/operations.md)与[当前禁备份约定](docs/2026-10-07-backups-disabled.md)

常用验证命令：

```sh
npm test
npm run typecheck
npm run build
npm run check:secrets
npm run check:clean-build
npm run test:persistence
npm run test:e2e
bash tests/scripts/run-empty-restore.sh
```

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=maxma615/yougui-couple-home&type=Date)](https://www.star-history.com/#maxma615/yougui-couple-home&Date)

## License

[MIT](LICENSE) © 2026 有归 contributors. 第三方依赖及其他第三方内容仍受其各自许可证约束。
