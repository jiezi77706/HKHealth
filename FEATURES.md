# 功能说明与 API 连接文档

## 目录

1. [意图路由系统](#1-意图路由系统)
2. [健康记录功能](#2-健康记录功能)
3. [药品搜索功能](#3-药品搜索功能)
4. [药房查找功能](#4-药房查找功能)
5. [公交路线功能](#5-公交路线功能)
6. [问诊资料功能](#6-问诊资料功能)
7. [语音交互功能](#7-语音交互功能)
8. [API 连接详情](#8-api-连接详情)

---

## 1. 意图路由系统

所有用户消息都通过 LLM 进行意图识别。LLM 在每次回复开头输出元数据标签：

```
<m>{"intent":"drug_search","he":null,"drug":{"q":"paracetamol","district":null}}</m>
自然语言回复...
```

### 意图类型

| intent | 触发条件 | 处理方式 |
|--------|---------|---------|
| `health_report` | 用户描述身体不适、症状、健康变化 | 解析 `he` 字段，记录到 localStorage |
| `drug_search` | 用户询问买药、找药房、药品信息 | 解析 `drug` 字段，搜索本地药品数据库 |
| `visit_prep` | 用户说"准备复诊资料"、"生成问诊摘要" | 启动问诊准备状态机 |
| `general_consultation` | 用户问一般健康知识（非个人症状） | 仅显示 LLM 文字回复 |
| `other` | 非健康相关 | 仅显示 LLM 文字回复 |

### 代码位置

- 元数据解析：`js/app.js` → `parseMeta(fullText)`
- 意图路由：`js/app.js` → `handleMeta(meta, bubble)`
- System Prompt（含意图判断规则）：`js/config.js` → `SYSTEM_PROMPT`

---

## 2. 健康记录功能

### 触发条件

LLM 返回 `intent: "health_report"` 且 `he` 不为 null。

### 记录级别

| 级别 | 条件 | 行为 |
|------|------|------|
| L0 | 太模糊/非个人/知识问题 | `he` 设为 null，不记录 |
| L1 | 症状清楚，信息足够 | 直接保存到 localStorage，显示绿色卡片 |
| L2 | 症状清楚但缺关键信息 | 显示黄色"记录中"卡片，LLM 追问一个问题 |

### L2 追问机制

当 LLM 返回 L2 级别时，`pendingFollowup` 状态被设置。用户下一条消息会被检查：
- 如果是对追问的回答 → LLM 合并信息后升级为 L1 记录
- 如果用户说了别的事 → 自动保存已有信息为 L2 记录

最多追问 2 轮，之后自动保存。

### 数据存储

- 存储位置：`localStorage` key `hk_health_events`
- 数据结构：`{id, original_text, structured: {what, onset, char, impact, ctx, prog}, standard_concept, level, recorded_at, status}`
- 管理代码：`js/db.js`

### UI 组件

- 健康卡片：`js/ui.js` → `renderHealthCard()`
- 待补全卡片：`js/ui.js` → `renderPendingCard()`
- 记录列表面板：`js/ui.js` → `renderRecordsList()`

---

## 3. 药品搜索功能

### 触发条件

LLM 返回 `intent: "drug_search"` 且 `drug` 不为 null。

`drug` 字段格式：
```json
{"q": "paracetamol", "district": "TSIM SHA TSUI"}
```

- `q`：英文药名或成分名（LLM 将中文翻译为英文，如"必理痛"→"paracetamol"）
- `district`：用户提到的地区（可选，如"尖沙咀"→"TSIM SHA TSUI"）

### 搜索逻辑

1. `q` 按 `OR` 分割为多个搜索词（如 `"amlodipine OR losartan"`）
2. 每个词在 `drugs.json` 中进行多维度匹配打分：
   - 药名完全匹配：100 分
   - 药名前缀匹配：70 分
   - 药名包含匹配：50 分
   - 成分完全匹配：80 分
   - 成分包含匹配：40 分
   - 许可证号匹配：90 分
3. 结果去重后按分数排序，取前 8 个

### 销售类别

| 类别 | 含义 | 颜色 | 数量 |
|------|------|------|------|
| POM | 处方药 Prescription Only Medicine | 红色 | 9,277 |
| P | 药剂师监管 Pharmacy Only | 黄色 | 1,597 |
| OTC | 非处方药 Over-the-Counter | 绿色 | 3,164 |
| unknown | 未分类 | 灰色 | 203 |

### 数据文件

- `data/drugs.json`：14,241 条记录
- 字段：`{n: 药名, p: 许可证号, i: [成分], s: 销售类别}`
- 数据来源：DrugList.xml + Compendium.pdf

### 代码位置

- 搜索引擎：`js/drugdb.js` → `searchDrugs(query, limit)`
- 类别信息：`js/drugdb.js` → `getSaleCatInfo(cat)`
- 流程控制：`js/app.js` → `handleDrugSearch(drugMeta, bubble)`
- 卡片渲染：`js/ui.js` → `renderDrugResults()`

---

## 4. 药房查找功能

### 触发条件

用户在药品搜索结果卡片上点击 **"查找药房"** 按钮。

### 筛选逻辑

- 如果 `drug.district` 有值，按地区筛选
- 否则返回全部药房（前 8 间）
- 支持按药房名称、地址、地区文本搜索

### 数据文件

- `data/pharmacies.json`：494 条记录
- 字段：`{name, nameZh, lic, addr, district, tel}`
- 数据来源：table_data.csv + LicPharmacyList.xml 合并

### 代码位置

- 搜索引擎：`js/pharmacydb.js` → `searchPharmacies({district, query, limit})`
- 流程控制：`js/app.js` → `showPharmaciesForDrug(drug, district)`
- 卡片渲染：`js/ui.js` → `renderPharmacyResults()`

---

## 5. 公交路线功能

### 触发条件

用户在药房结果卡片上点击 **"公交路线"** 按钮。

### 执行流程

1. 尝试获取用户 GPS 位置（`navigator.geolocation`）
2. 如果 GPS 不可用，使用药房所在区的中文名作为起点（通过 `DISTRICT_ZH` 映射表）
3. 清洗药房地址（去除 SHOP/FLAT/G/F 前缀和 HK/KLN/NT 后缀）
4. 调用 Toolhub `transport_route` 工具获取路线
5. 渲染路线卡片，显示最多 2 条路线

### 路线卡片内容

- 总时长、总距离、总费用
- 步行段：距离和时间（连续步行段自动合并）
- 公交段：线路名、上车站、下车站（繁体中文）、站数、时间

### 代码位置

- 路线请求：`js/toolhub.js` → `planRoute(origin, destination, mode)`
- GPS 获取：`js/toolhub.js` → `getUserLocation()`
- 地址清洗：`js/app.js` → `cleanAddr(addr)`
- 地区翻译：`js/app.js` → `DISTRICT_ZH` 映射表（34 个地区）
- 流程控制：`js/app.js` → `showTransitRoute(pharmacy)`
- 卡片渲染：`js/ui.js` → `renderRouteCard()`
- 步行合并：`js/ui.js` → `mergeWalkSteps()`

---

## 6. 问诊资料功能

### 触发条件

两种方式：
1. **聊天触发**：LLM 返回 `intent: "visit_prep"` → 进入问诊准备状态机
2. **面板触发**：用户打开 Health Records 面板 → 点击"Generate Visit Brief"按钮

### 状态机流程

```
用户说"我想准备复诊资料"
  → LLM 返回 intent: visit_prep
  → 设置 visitPrepState = { topic: null }
  → LLM 追问复诊主题

用户回答复诊主题（如"头痛"）
  → 检查当前 intent：
    - 如果是 drug_search/health_report → 取消问诊准备，处理新意图
    - 否则 → 继续问诊流程
  → 从 localStorage 检索相关健康记录
  → 显示问诊资料草稿卡片（含匹配的记录）
  → 用户点击"确认生成摘要" → 调用 LLM 生成问诊摘要
  → 用户点击"取消" → 重置状态
```

### 摘要生成

确认后，使用单独的 LLM 请求（非 streaming，temperature=0.3）生成问诊摘要，保存到 `localStorage` key `hk_visit_briefs`。

### 代码位置

- 状态机：`js/app.js` → `sendMessage()` 中的 visit prep flow 部分
- 摘要生成：`js/app.js` → `confirmVisitBrief(topic, events)`
- 草稿卡片：`js/ui.js` → `renderVisitDraftCard()`
- 摘要卡片：`js/ui.js` → `renderVisitBriefCard()`

---

## 7. 语音交互功能

### 语音输入

- **触发**：点击麦克风按钮
- **技术**：Web Speech API (`SpeechRecognition`)
- **支持语言**：粤语 (zh-HK)、繁中 (zh-TW)、普通话 (zh-CN)、英文 (en-US)
- **UI**：录音时显示红色录音条（波形动画 + 计时器），可取消
- **结束**：再次点击麦克风 → 自动发送识别文本

### 语音朗读

- **触发**：点击每条回复下方的 🔊 按钮
- **自动朗读**：Settings 面板中可开启 Auto-read
- **技术**：Web Speech API (`SpeechSynthesis`)
- **Voice 选择**：Settings 面板中可选择 TTS 声音

### 代码位置

- 语音模块：`js/voice.js`

---

## 8. API 连接详情

### 8.1 LLM Chat API

聊天功能的核心 API，使用 OpenAI 兼容格式。

| 项目 | 详情 |
|------|------|
| 上游地址 | `https://test-new-api.hkchat.app/v1/chat/completions` |
| 认证 | Bearer Token (`LLM_API_KEY`) |
| 模型 | `t2_hkgai-v3_fp8_1m_e7` |
| 协议 | OpenAI Chat Completion，支持 SSE streaming |
| 代理路径 | 前端 → `POST /api/chat` → Vercel/dev-server 代理 → 上游 |

**请求流程：**

```
浏览器                    服务端代理                  LLM API
  │                         │                         │
  │ POST /api/chat          │                         │
  │ {messages, stream:true} │                         │
  │ ──────────────────────> │                         │
  │                         │ POST /v1/chat/completions
  │                         │ Authorization: Bearer sk-xxx
  │                         │ ──────────────────────> │
  │                         │                         │
  │                         │ <── SSE stream ──────── │
  │ <── SSE stream ──────── │                         │
  │                         │                         │
```

**代理实现：**
- Vercel 部署：`api/chat.js`（Serverless Function）
- 本地开发：`dev-server.mjs`（`/api/chat` 路由）

**前端调用：**
```javascript
// js/config.js
export const API_BASE = '/api/chat';

// js/app.js → sendMessage()
const resp = await fetch(API_BASE, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: apiMessages, temperature, stream: true })
});
// 逐行解析 SSE data: 行，提取 delta.content
```

### 8.2 Toolhub MCP API

HKGAI Toolhub 提供地理和交通工具，使用 MCP (Model Context Protocol) 的 JSON-RPC over SSE 协议。

| 项目 | 详情 |
|------|------|
| 上游地址 | `https://toolhub.prod.hkchat.app/mcp` |
| 认证 | 自定义 Header：`App-Name` + `App-Key` |
| 协议 | JSON-RPC 2.0 over SSE |
| 代理路径 | 前端 → `POST /api/tools` → Vercel/dev-server 代理 → Toolhub |

**请求流程：**

```
浏览器                    服务端代理                  Toolhub MCP
  │                         │                         │
  │ POST /api/tools         │                         │
  │ {tool, args}            │                         │
  │ ──────────────────────> │                         │
  │                         │ POST /mcp               │
  │                         │ App-Name: ext-xxx       │
  │                         │ App-Key: 5e3daa...      │
  │                         │ Accept: application/json,│
  │                         │   text/event-stream     │
  │                         │ {jsonrpc:"2.0",         │
  │                         │  method:"tools/call",   │
  │                         │  params:{name, arguments}}
  │                         │ ──────────────────────> │
  │                         │                         │
  │                         │ <── SSE: data: {result} │
  │                         │                         │
  │                         │ 解析 SSE，提取           │
  │                         │ structuredContent 或     │
  │                         │ content[0].text         │
  │ <── JSON result ─────── │                         │
```

**代理实现：**
- Vercel 部署：`api/tools.js`
- 本地开发：`dev-server.mjs`（`/api/tools` 路由）

**前端调用：**
```javascript
// js/toolhub.js
export async function callTool(tool, args) {
  const resp = await fetch('/api/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args })
  });
  return resp.json();
}

export async function planRoute(origin, destination, mode = 'transit') {
  const args = { mode, language: 'zh-HK' };
  // origin/destination 可以是字符串（地名）或 {lat, lng} 对象
  const result = await callTool('transport_route', args);
  return result?.data || result;
}
```

### 8.3 当前使用的 Toolhub 工具

目前只使用了 `transport_route`，Toolhub 共提供 10 个工具可供扩展：

| 工具 | 说明 | 是否已使用 |
|------|------|-----------|
| `transport_route` | 公交/驾车路线规划 | **是** |
| `geo_search` | 地理搜索（POI） | 否 |
| `geo_lookup` | 地理编码（地址→坐标） | 否 |
| `transit_eta` | 公交到站时间 | 否 |
| `transit_fare` | 公交票价查询 | 否 |
| `healthcare_ae_wait` | 急诊等候时间 | 否 |
| `weather_current` | 当前天气 | 否 |
| `weather_forecast` | 天气预报 | 否 |
| `weather_warning` | 天气警告 | 否 |
| `weather_tips` | 天气贴士 | 否 |

### 8.4 `transport_route` 参数与返回

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `origin` | string | 起点地名（与 lat/lng 二选一） |
| `origin_lat` | number | 起点纬度 |
| `origin_lng` | number | 起点经度 |
| `destination` | string | 终点地名（与 lat/lng 二选一） |
| `dest_lat` | number | 终点纬度 |
| `dest_lng` | number | 终点经度 |
| `mode` | string | `transit`（公交）或 `driving`（驾车） |
| `language` | string | `zh-HK`（繁中）、`en`（英文） |

**返回结构：**

```json
{
  "endpoints": {
    "origin": { "name_tc": "牛頭角", "name_en": "Ngau Tau Kok" },
    "destination": { "name_tc": "春生厚藥房", "name_en": "..." }
  },
  "results": [
    {
      "duration_seconds": 1800,
      "distance_meters": 8400,
      "fare": { "amount": 48.4, "currency": "HKD" },
      "steps": [
        {
          "mode": "walk",
          "distance_meters": 304,
          "duration_seconds": 240
        },
        {
          "mode": "transit",
          "duration_seconds": 360,
          "transit": {
            "line_name_tc": "藍田站 - 機場",
            "vehicle_type_tc": "巴士",
            "departure_stop": { "name_tc": "牛頭角下邨" },
            "arrival_stop": { "name_tc": "觀塘游泳池" },
            "num_stops": 5
          }
        }
      ]
    }
  ]
}
```

### 8.5 浏览器端 API（无服务端）

以下功能直接在浏览器运行，不经过服务端：

| API | 用途 | 代码位置 |
|-----|------|---------|
| `navigator.geolocation` | 获取用户 GPS 位置 | `js/toolhub.js` → `getUserLocation()` |
| `SpeechRecognition` | 语音转文字 | `js/voice.js` → `startRec()` |
| `SpeechSynthesis` | 文字转语音 | `js/voice.js` → `speak()` |
| `localStorage` | 持久化健康记录和问诊摘要 | `js/db.js` |

---

## 功能交互流程图

```
用户输入（文字/语音）
  │
  ├─ POST /api/chat → LLM 返回 <m>JSON</m> + 自然语言
  │
  ├─ 解析 meta.intent
  │   │
  │   ├─ health_report → 记录症状 → 显示健康卡片
  │   │   └─ L2 级别 → 追问 → 用户回答 → 升级 L1
  │   │
  │   ├─ drug_search → 搜索 drugs.json → 显示药品卡片
  │   │   └─ 点击"查找药房" → 搜索 pharmacies.json → 显示药房卡片
  │   │       └─ 点击"公交路线" → POST /api/tools (transport_route)
  │   │           → 显示路线卡片
  │   │
  │   ├─ visit_prep → 进入问诊状态机
  │   │   └─ 用户提供主题 → 匹配健康记录 → 显示草稿
  │   │       └─ 确认 → POST /api/chat (非streaming) → 生成摘要
  │   │
  │   └─ general_consultation / other → 仅显示 LLM 回复
  │
  └─ 显示文字 + 朗读按钮
```
