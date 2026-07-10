# 宝宝辅食日记

一个适合家庭共同使用的宝宝辅食计划与实际喂养记录网站。首页是以周一开始的月历，支持一天多餐、结构化食材、实际完成情况、身体反应、筛选和月度打印。

## Docker 部署

要求服务器已安装 Docker 和 Docker Compose，并已有负责 HTTPS 的 Nginx、Caddy 或其他反向代理。

```bash
cp .env.example .env
npm run password:hash -- '换成至少8位的家庭密码'
openssl rand -hex 32
```

把前一条命令输出的整行哈希填写到 `.env` 的 `DODOBABY_PASSWORD_HASH`，把随机字符串填写到 `DODOBABY_SESSION_SECRET`，再将 `APP_URL` 改为实际 HTTPS 域名。

```bash
docker compose up -d --build
docker compose ps
```

应用默认只监听宿主机 `127.0.0.1:3000`。可参考 [Nginx 配置示例](docs/nginx.conf.example) 接入现有反向代理。

升级代码后重新执行：

```bash
docker compose up -d --build
```

SQLite 数据保存在 Docker 卷 `dodobaby_data` 中，重建应用容器不会删除记录。除卷级备份外，也可在网站的“导出”菜单下载每月 JSON 完整数据或 CSV 表格。

## GitHub Actions 与镜像发布

推送到 `main`、创建 `v*.*.*` 标签或发起面向 `main` 的 Pull Request 时，GitHub Actions 会自动构建 Docker 镜像。为自动发布多架构镜像到 Docker Hub，请在仓库的 Actions secrets 或 variables 中设置：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

发布后的镜像名为 `DOCKERHUB_USERNAME/dodobaby`，`main` 会更新 `latest` 标签；未配置上述凭据时，工作流仍会完成镜像构建验证，但会跳过推送。

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

开发环境可把 `APP_URL` 设置为 `http://localhost:3000`，把 `DATABASE_PATH` 设置为 `./data/dodobaby.db`。

常用检查：

```bash
npm run test
npm run lint
npm run build
```

## 数据与打印

- 每次写入会在一个 SQLite 事务内更新餐次、食材和反应标签。
- 月度 PDF 与高清图片由容器内 Chromium 生成，Docker 镜像已经包含中文字体。
- PNG 主日历为 A4 横向 300 DPI；内容过多时自动在下方追加详情页。
- PDF 使用 A4 横向分页，适合打印或另存归档。
