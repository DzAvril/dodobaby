# 小芽日记

一个适合家庭共同使用的宝宝照护记录网站。首页只提供跨模块概览，辅食、喂养、睡眠、尿布、用药、生长、疫苗与设置均使用独立页面；当前支持辅食月历、多餐与反应记录，亲喂与瓶喂时间线，跨午夜睡眠，尿布观察，用药计划与实际服用记录，体重、身长/身高、头围趋势与 WHO 标准曲线对比，以及家庭接种计划与实际接种事实记录。手机底栏的三个高频模块可以在设置中调整。

## Docker 部署

要求服务器已安装 Docker 和 Docker Compose，并已有负责 HTTPS 的 Nginx、Caddy 或其他反向代理。

```bash
cp .env.example .env
npm run password:hash -- '换成至少8位的家庭密码'
openssl rand -hex 32
```

把前一条命令输出的整行哈希填写到 `.env` 的 `DODOBABY_PASSWORD_HASH`，把随机字符串填写到 `DODOBABY_SESSION_SECRET`，再将 `APP_URL` 改为实际 HTTPS 域名。

部署并登录后，可在“设置 → Agent / MCP 访问”中生成独立 token。原始 token 只显示一次，应用数据库仅保存 SHA256 hash；请把原始 token 保存在本地 Codex MCP 配置或 token 文件中。

旧部署仍可通过命令生成 token：

```bash
npm run agent:token
```

把输出中的 `DODOBABY_AGENT_TOKEN_SHA256` 配进应用环境；`DODOBABY_AGENT_TOKEN` 只保存在本地 Codex MCP 配置或本机环境变量中，不要提交到仓库。环境变量 hash 仅作为兼容 fallback，一旦网页生成或撤销过 token，数据库配置优先。

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

推送到 `main`、创建 `v*.*.*` 标签或发起面向 `main` 的 Pull Request 时，GitHub Actions 会自动构建 Docker 镜像。为自动发布多架构镜像和 Telegram 通知，请在 GitHub Environment `BuildImage` 中配置：

- Variable：`DOCKERHUB_USERNAME`（也可保存为 Secret）
- Secrets：`DOCKERHUB_TOKEN`、`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`

发布后的镜像名为 `DOCKERHUB_USERNAME/dodobaby`，`main` 会更新 `latest` 标签。敏感 token 不得配置为 Actions Variable；缺少发布或通知凭据时，发布任务会直接失败，避免出现“流水线成功但镜像或通知未产生”的假成功。

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

## 远程 Codex MCP

应用直接在 `/mcp` 提供 Streamable HTTP MCP 服务，支持辅食餐次、辅食库、喂养、睡眠、尿布、用药计划、实际用药、生长和疫苗记录的增删改查。客户端只需要部署地址和设置页生成的原始 token，不需要克隆本仓库或安装 Node.js。

```bash
export DODOBABY_AGENT_TOKEN='设置页生成的原始 token'
codex mcp add dodobaby \
  --url https://你的域名/mcp \
  --bearer-token-env-var DODOBABY_AGENT_TOKEN
```

仓库内的 `npm run mcp:dodobaby` 仅保留给本地开发和兼容旧的 stdio 配置，生产客户端应使用远程 `/mcp` 端点。

常用 MCP 工具包括 `dodobaby_record_contracts`、`dodobaby_list_records`、`dodobaby_get_record`、`dodobaby_create_record`、`dodobaby_update_record`、`dodobaby_delete_record` 和 `dodobaby_end_sleep_record`。

CI 还会启动实际 Docker 容器，在隔离数据库中验证登录保护、同源拦截、生长、睡眠、尿布、喂养与疫苗记录 CRUD、真实 PDF 导出，以及桌面和手机端的关键浏览器交互。

## 数据与打印

- 每次写入会在一个 SQLite 事务内更新餐次、食材和反应标签。
- 喂养记录使用独立业务表，一次会话可以同时保存左右侧亲喂、瓶喂母乳和配方奶，不与辅食计划混用。
- 睡眠记录保存绝对开始、结束时刻和录入时区；跨午夜记录按宝宝时区的自然日实际重叠时长汇总，同一宝宝只能有一段进行中的睡眠。
- 尿布记录使用独立业务表，分别保存小便、大便和换尿布时的家庭观察，不作医疗判断。
- 用药计划按开始日期、间隔天数和每日时间点生成安排，可用两个错开一天的每两天计划表达交替用药；实际用药记录保留药品和剂量快照，不提供剂量建议。
- 生长记录使用独立业务表并通过 `baby_id` 隔离；个人测量会按出生性别叠加 WHO 2006 官方逐日 P3/P15/P50/P85/P97 标准曲线，超过 WHO 0–5 岁范围后仍保留个人趋势。曲线仅用于分布参考，不提供医疗判断；数据来源、校验哈希和身长/身高切换规则见 [WHO 生长标准数据说明](docs/who-growth-standards.md)。
- 疫苗记录使用独立业务表，仅保存家庭自行录入的计划与接种事实，不生成接种建议；请始终以接种单位和官方记录为准。
- 月度 PDF 与高清图片由容器内 Chromium 生成，Docker 镜像已经包含中文字体。
- PNG 主日历为 A4 横向 300 DPI；内容过多时自动在下方追加详情页。
- PDF 使用 A4 横向分页，适合打印或另存归档。
