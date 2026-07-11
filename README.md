# 小芽日记

一个适合家庭共同使用的宝宝照护记录网站。首页提供跨模块概览，辅食、生长与设置使用独立页面；当前支持辅食月历、多餐与反应记录，以及体重、身高、头围的生长趋势。

## Docker 部署

要求服务器已安装 Docker 和 Docker Compose，并已有负责 HTTPS 的 Nginx、Caddy 或其他反向代理。

```bash
cp .env.example .env
npm run password:hash -- '换成至少8位的家庭密码'
openssl rand -hex 32
```

把前一条命令输出的整行哈希填写到 `.env` 的 `DODOBABY_PASSWORD_HASH`，把随机字符串填写到 `DODOBABY_SESSION_SECRET`，再将 `APP_URL` 改为实际 HTTPS 域名。

```bash
docker compose pull
docker compose up -d
docker compose ps
```

应用默认只监听宿主机 `127.0.0.1:3000`。可参考 [Nginx 配置示例](docs/nginx.conf.example) 接入现有反向代理。

升级代码后重新执行：

```bash
docker compose pull
docker compose up -d --force-recreate
```

SQLite 数据保存在部署目录的 `./data` 中，重建应用容器不会删除记录。辅食页面的“导出”菜单可下载当月 JSON、CSV、PDF 或高清图片。

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
- 生长记录使用独立业务表并通过 `baby_id` 隔离，曲线只展示个人趋势，不提供医疗判断。
- 月度 PDF 与高清图片由容器内 Chromium 生成，Docker 镜像已经包含中文字体。
- PNG 主日历为 A4 横向 300 DPI；内容过多时自动在下方追加详情页。
- PDF 使用 A4 横向分页，适合打印或另存归档。
