# HK Health Assistant

基于 HKGAI 大语言模型的香港健康助手，支持粤语/普通话/英文多语言交互。提供健康记录、药品搜索、药房查找、公交路线规划等功能。

## 功能概览

- **健康记录** — 通过自然对话自动识别和记录用户的健康症状，支持追问补全信息
- **药品搜索** — 从 14,241 个注册药品中搜索，显示销售类别（POM/P/OTC）
- **药房查找** — 从 494 间注册药房中按地区筛选，显示地址和电话
- **公交路线** — 调用 HKGAI Toolhub 获取到药房的公交路线（步行 + 巴士/地铁）
- **问诊资料** — 基于健康记录自动生成问诊摘要，方便复诊使用
- **语音交互** — 支持语音输入（Speech Recognition）和语音朗读（TTS）

## 技术架构

```
前端 (ES Modules, 纯 HTML/CSS/JS)
 ├── index.html
 ├── css/style.css
 └── js/
     ├── app.js        — 主逻辑、意图路由、状态机
     ├── config.js      — API 地址、System Prompt
     ├── db.js          — localStorage 持久化
     ├── drugdb.js      — 药品搜索引擎
     ├── pharmacydb.js  — 药房搜索引擎
     ├── toolhub.js     — Toolhub 路线规划客户端
     ├── ui.js          — UI 组件渲染
     └── voice.js       — 语音输入/朗读

API 代理 (Vercel Serverless / dev-server.mjs)
 ├── api/chat.js    — LLM 聊天代理 (SSE streaming)
 └── api/tools.js   — Toolhub MCP 代理

数据文件
 ├── data/drugs.json       — 14,241 个药品 (249KB gzip)
 └── data/pharmacies.json  — 494 间药房 (112KB)
```

## 快速开始

### 环境要求

- Node.js 18+
- `.env` 文件配置（见下方）

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/jiezi77706/HKHealth.git
cd HKHealth

# 创建 .env 文件
cp .env.example .env  # 然后填入实际的 API 密钥

# 启动开发服务器
node dev-server.mjs
# 访问 http://localhost:3456
```

### Vercel 部署

```bash
npm i -g vercel
vercel --prod
```

在 Vercel 项目设置中配置以下环境变量（见 `.env` 说明）。

### 环境变量

| 变量 | 说明 |
|------|------|
| `LLM_API_URL` | LLM Chat Completion API 地址 |
| `LLM_API_KEY` | LLM API 密钥 |
| `LLM_MODEL` | 模型名称 |
| `TOOLHUB_URL` | HKGAI Toolhub MCP 端点 |
| `TOOLHUB_APP_NAME` | Toolhub App Name |
| `TOOLHUB_APP_KEY` | Toolhub App Key |

## 数据来源

| 数据 | 来源 | 说明 |
|------|------|------|
| 药品名称、成分、许可证号 | 香港药剂业及毒药管理局 DrugList.xml | 14,241 个注册药品 |
| 药品销售类别 (POM/P/OTC) | 香港药典 Compendium.pdf | 976 页 PDF 提取 |
| 注册药房名称、地址 | 药房牌照数据 table_data.csv | 494 间药房 |
| 药房电话、地区 | LicPharmacyList.xml | 与 CSV 数据合并 |

## 项目结构

```
hkhealth/
├── index.html          # 单页应用入口
├── css/style.css       # 样式（支持 light/dark 主题）
├── js/                 # 前端模块
├── api/                # Vercel serverless functions
├── data/               # 药品和药房 JSON 数据
├── dev-server.mjs      # 本地开发服务器
├── vercel.json         # Vercel 路由配置
├── package.json
└── .env                # 环境变量（gitignored）
```

## License

MIT
