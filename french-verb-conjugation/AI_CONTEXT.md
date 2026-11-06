# French Verbs — AI Project Context

> 本文档供后续 AI 会话快速建立项目上下文。优先读本文，再按需打开对应源码。  
> 路径：`/Users/codiy/Repos/raycast-extensions/french-verb-conjugation`

---

## 1. 项目是什么

Raycast 扩展：**French Verbs**（manifest `name`: `french-verbs`）。

- **用途**：法语动词变位查询 + 填空练习（面向中文学习者，时态标签多为中文）。
- **作者**：`Jeffizz`（`package.json`）
- **分类**：Education · 许可证 MIT
- **依赖**：仅 `@raycast/api`（runtime）；开发依赖 TypeScript / React types
- **无扩展 Preferences**（`raycast-env.d.ts` 中 `ExtensionPreferences = {}`）

两个用户可见命令：

| 命令文件 | manifest name | 标题 | 模式 | 作用 |
| --- | --- | --- | --- | --- |
| `src/lookup.tsx` | `lookup` | **Conjugate** | view | 查变位表 + 分时态朗读 |
| `src/practice.tsx` | `practice` | **Practice** | view | 格子填空练习 + 检查 |

本地文件夹名是 `french-verb-conjugation`，扩展 id/name 是 `french-verbs`，两者不要混用。

---

## 2. 目录结构（只关心这些）

```
french-verb-conjugation/
├── package.json          # Raycast manifest + scripts
├── tsconfig.json         # ES2023, commonjs, jsx react-jsx, resolveJsonModule
├── raycast-env.d.ts      # 自动生成，勿手改
├── README.md             # 简短中文使用备忘（面向人）
├── AI_CONTEXT.md         # 本文件（面向 AI）
├── assets/
│   ├── icon.png
│   └── icon@dark.png     # Raycast 图标必须在 assets/
└── src/
    ├── lookup.tsx        # Conjugate 命令入口
    ├── practice.tsx      # Practice 命令入口
    ├── open-verb.tsx     # 启动：解析上下文 → 选词 → 渲染命令视图
    ├── pick-verb.tsx     # 动词选择列表（我的 / 常用 / 搜索）
    ├── edit-mine.tsx     # 编辑「我的动词」表单
    ├── launch.ts         # 选中文本 / 剪贴板 → 候选原形
    ├── mine.ts           # LocalStorage 我的动词 CRUD
    ├── model.ts          # 类型、时态、搜索、判分、markdown、朗读文案
    ├── data.ts           # 加载 verbs.json + h-aspire + randomVerb
    ├── speech.ts         # frdic TTS 缓存 + afplay
    ├── cell-image.ts     # Practice 格子 PNG 光栅渲染
    ├── font.json         # 位图字形（cell-image 用）
    ├── verbs.json        # 变位词库（大，~3.9MB）
    └── h-aspire.json     # h aspiré 动词表（影响 je → j'）
```

**不要**把 `node_modules/`、`dist/`、`.raycast-codegen` 当源码读。

开发脚本：

```bash
npm run dev    # ray develop
npm run build  # ray build -e dist
npm run lint   # ray lint
```

---

## 3. 数据源（重要）

### 3.1 上游仓库

变位数据来自开源项目：

- **GitHub**: https://github.com/ShingZhanho/verbe-conjugaison-academie-francaise  
- **内容**：法兰西学术院（Académie française）《词典》第 9 版相关动词变位的数字化整理  
- **上游格式**：每个动词一个独立 JSON（约 6000+ 文件），字段完整（多语式、复合时态、助动词、代词变位等）  
- **上游许可证**：仓库声明 **CC BY-NC-SA 4.0**（非商业、署名、相同方式共享）  
  - 本扩展 `package.json` 写的是 MIT；若发布到 Raycast Store 或对外分发，需单独处理数据许可与归因，不要默认「整包 MIT 覆盖数据」。

上游典型单动词字段（概念层，非本仓库运行时格式）：

- 简单时态：`indicatif` / `subjonctif` / `conditionnel` / `imperatif` / `participe` / `infinitif` 等  
- 复合时态、助动词 `avoir`/`être`、代词式等  

本扩展**没有**把上游完整 schema 原样打进包里，而是做了**精简打包**。

### 3.2 本扩展运行时词库 `src/verbs.json`

```ts
type VerbBook = {
  source: string;   // 当前: "academie-francaise-9e"
  version: string;  // 当前: "v0.5.0"
  verbs: Record<string, VerbForms>;
  common: string[]; // 常用表，当前 222 个
};

type VerbForms = {
  pp: string[];           // 过去分词（可多形，如 abimé/abîmé）
  prp: string[];          // 现在分词
  t: Cell[][];            // 6 个时态 × 6 个人称
};

type Cell = string[] | null; // null = 无此形（命令式 je/il/ils 等）；string[] 可含异体
```

**规模（以当前文件为准）**

| 项 | 值 |
| --- | --- |
| 动词数 | **6358** |
| 常用 `common` | **222**（être, avoir, aller, faire…） |
| `source` | `academie-francaise-9e` |
| `version` | `v0.5.0` |
| 带 `_1`/`_2` 义项后缀的 key | 124 个（如 `baraquer_1`） |
| 单元可多拼写 | 大量（重音异体等） |

**`t` 时态下标（与 `TENSES` 严格对齐）**

| index | 中文 UI | 法语 |
| --- | --- | --- |
| 0 | 现在时 | présent |
| 1 | 未完成过去时 | imparfait |
| 2 | 简单将来时 | futur simple |
| 3 | 条件式现在时 | conditionnel |
| 4 | 虚拟式现在时 | subjonctif |
| 5 | 命令式 | impératif |

**人称下标（与 `ROWS` 对齐）**

| index | label | subject（朗读用） |
| --- | --- | --- |
| 0 | je | Je |
| 1 | tu | Tu |
| 2 | il | Il |
| 3 | nous | Nous |
| 4 | vous | Vous |
| 5 | ils | Ils |

命令式示例（`être`）：`[null, ["sois"], null, ["soyons"], ["soyez"], null]`。

### 3.3 本扩展相对上游的裁剪

有意**不包含**（除非以后明确加需求）：

- 复合时态（passé composé、plus-que-parfait…）
- 其他语式变体的完整树
- 独立「代词式动词」词条（词库 key 基本是非代词原形；搜索会剥 `se` / `s'`）
- 上游逐文件布局（这里是单文件 `verbs.json`）

更新词库时：从上游生成/转换 → 覆盖 `src/verbs.json`，并同步 `source`/`version`；检查 `common` 是否仍有效。

### 3.4 `h-aspire.json`

- 字符串数组，约 51 个 **h aspiré** 动词（如 `haïr`, `hurler`）。
- `data.ts` 建成 `Set`：`hAspire`。
- 用途：`withSubject` 在 `Je` + 元音/哑音 h 时用 `J'`；**h aspiré 不省音**（`Je hurle` 而非 `J'hurle`）。

---

## 4. 架构与数据流

```
用户触发 Conjugate / Practice
        │
        ▼
  OpenVerb (open-verb.tsx)
        │  verbFromContext(fallbackText)
        │    1. LaunchProps.fallbackText
        │    2. getSelectedText()
        │    3. Clipboard（≤40 字符且 ≤3 词）
        │
        ├─ 解析到 infinitive ──► LookupView / PracticeGrid
        │
        └─ 否则 ──► PickVerb（我的 / 常用 / 搜索）
                         │
                         └─ onPick(infinitive) 覆盖 override
```

共享能力：

- **词库**：`data.book` / `data.hAspire` / `data.randomVerb`
- **模型**：`model.ts`（纯函数，无 React）
- **我的动词**：`mine.ts` → `LocalStorage` key `"my-verbs"`（JSON 字符串数组）
- **朗读**：`speech.ts` → frdic API → 临时目录缓存 mp3 → `/usr/bin/afplay`
- **练习格图像**：`cell-image.ts` + `font.json` → 写 PNG 到 `tmpdir()/french-verbs-cells-v5`

---

## 5. 模块职责速查

### `model.ts` — 领域核心

| 函数 | 作用 |
| --- | --- |
| `fold` | NFD 去变音、œ/æ 展开、小写；用于搜索/解析 |
| `infinitiveQuery` | fold 后再去掉前导 `s'` / `se ` |
| `resolveVerb` | 输入 → 词库精确 key（先 raw lower，再 fold 匹配） |
| `searchVerbs` | exact → prefix → contains，默认 limit 40 |
| `normAnswer` / `gradeAnswer` | 练习判分：NFC、小写、统一撇号、压缩空白；多标准形任一命中即 ok |
| `withSubject` | 为朗读补主语；处理已有主语、代词式 nous/vous、J' 省音 |
| `speechLines` / `conjugationPrompt` | 生成分词/各时态朗读行；分词行会大写读出原形 |
| `tableMarkdown` | Conjugate 的 Detail markdown 表 |
| `practiceMarkdown` | 旧/备用练习 markdown（当前 Practice UI 主路径是 Grid+PNG） |
| `expectedOf` / `answerIds` / `slotLabel` | 练习格 id：`pp` / `prp` / `c{row}-{tense}` |

### `launch.ts`

- `tidy`：空白归一、最多 3 词、去首尾非字母。
- 剪贴板过长或词太多则忽略，避免误用整段文章。

### `mine.ts`

- 只保留词库中真实存在的 key。
- `parseMine`：按换行/逗号/分号/顿号拆分，`resolveVerb` 去重；返回 `{ known, unknown }`。
- `randomOf`：空列表时 fallback `"être"`（与 `randomVerb` 一致）。

### `pick-verb.tsx`

- 无搜索词：先「我的」，再「常用」。
- 有搜索词：只显示 `searchVerbs` 匹配。
- Action：随机我的 / 随机常用 / 随机全部、编辑我的动词。

### `lookup.tsx`（Conjugate）

- `Detail` + `tableMarkdown`。
- Action：各时态/分词朗读（快捷键 `⌘0` 分词，`⌘1`–`⌘6` 对应 6 时态）、换动词 `⌘N`、加入/移出我的、编辑我的。

### `practice.tsx`（Practice）

- `Grid` 6 列，`aspectRatio 16/9`，`inset Zero`，`fit Fill`，`filtering={false}`。
- **搜索栏 = 当前格输入**（不是过滤列表）。
- 选中格 id 存在 state `cursor`；`answers: Record<id, string>`。
- 用 `lock` / `echo` ref 避免 Grid 选中与 searchText 回写打架（120ms lock）。
- **回车**：同一时态向下换人；人满则下一时态 je；再循环。分词模式在 pp/prp 间切。
- **`⌘↩`**：检查已填格；空格不记分；错格 `correct` 红字显示标准形。
- **布局** `⌘⇧L`：人称做列 ↔ 时态做列（`layout`: `persons` | `tenses`）。
- **模式** `⌘⇧P`：练习变位 ↔ 练习分词（`mode`: `tenses` | `parts`）。
- **清空** `⌘⇧⌫`。
- 随机我的 / 常用 / 全部；加入/移出/编辑我的。
- 格子内容：`cellImage(...)` 生成的 PNG 路径。
- 仅第一人称行（`c0-*`）在图上显示时态中文 label；分词显示「过去分词/现在分词」。

### `cell-image.ts`

- 自研 RGB 光栅 + 手写 PNG（IHDR/IDAT/IEND），不依赖 canvas。
- 字形来自 `font.json`：`glyphs[ch] = { w, h, a: base64 alpha }`。
- 样式：`plain | selected | bad | ok | header | headerOn | na`。
- 缓存目录：`os.tmpdir()/french-verbs-cells-v5`，文件名 SHA1(key)。
- `boardImage` 存在但 Practice 当前按格调用 `cellImage`。
- **约束**：缺字形时跳过并留空宽；改 UI 字色/字号需动本文件与缓存 key 版本后缀。

### `speech.ts`

- API：`https://api.frdic.com/api/v2/speech/speakweb`
- 参数：`langid=fr`，`txt = "QYN" + base64(utf8 text)`（`QYN` 为 frdic 前缀约定）
- 缓存：`tmpdir()/frdic-cache/`，文件名由 url-safe base64 派生
- 播放：`afplay`；新朗读会 `SIGTERM` 上一段
- 与作者另一扩展 **Frdic Pronounce** 同源思路；本扩展内是精简版，无翻译/代理设置

---

## 6. UX / 产品约定（改代码时保持）

1. **启动优先级**：选中文本 > 短剪贴板 > 手动选词。  
2. **6358 动词全可用**；常用 222；「我的」用户自定义。  
3. **没输入时**，选词列表「我的」排在「常用」前。  
4. **随机我的**只抽我的列表；空则 toast 失败。  
5. Practice **不在格子上标 je/tu 全文**（图上主要是时态/分词标签 + 填写内容）。  
6. 过去分词、现在分词在分词模式里单独练；变位模式默认从 `c0-0`。  
7. 判分忽略大小写与部分撇号差异，但**需要正确字母/重音对应到某一标准形**（`normAnswer` 不去掉变音符号——与 `fold` 不同）。  
8. 图标只认 `assets/icon.png`（及 dark 变体）。  
9. Grid 圆角是 Raycast 控件自带，去不掉；已用 `Inset.Zero` 压内边距。

---

## 7. 关键实现细节（易踩坑）

### 搜索 vs 判分归一化不一致（有意）

- **找动词**：`fold` 去变音 → `etre` 能命中 `être`。  
- **判分**：`normAnswer` **保留**变音 → 用户仍需写出正确重音形（或词库提供的某一异体）。  
- 改判分策略前先确认学习目标。

### 练习格 id

- `pp`, `prp`  
- `c{person}-{tense}`，person/tense 从 0 起  
- 不要改 id 格式，除非同时改 `expectedOf` / `practice.tsx` / markdown 辅助函数。

### OpenVerb override 语义

- `override === null`：用 launch 解析结果  
- `override === ""`：强制回到 PickVerb  
- `override === "aller"`：打开该动词  
- Practice 用 `key={infinitive}` 在换词时重置 state

### 词条 key

- 多数为小写原形。  
- 同形多义：`verb_1` / `verb_2`。  
- UI 展示的是 key 本身；搜索 `fold` 后 match。

### 大 JSON

- `verbs.json` ~3.9MB，`font.json` ~0.4MB，随扩展打包。  
- 不要在热路径反复 `JSON.parse`；已通过 `import` 一次加载。  
- 避免在 AI 回复里整文件粘贴。

---

## 8. 朗读文案格式

`conjugationPrompt(infinitive, pieces, sayInfinitive?)`：

- 中间形式用 `?` 连接并 `\t` 分隔（给 TTS 停顿）  
- 分词行：`ÊTRE. été? étant` 这类（原形大写 + 分词）  
- 时态行：带主语（命令式不带 `withSubject` 的主语逻辑，直接用原 cell）

快捷键（Conjugate / Practice 相同）：

| 快捷键 | 内容 |
| --- | --- |
| `⌘0` | 分词 |
| `⌘1`…`⌘6` | 六个时态（按 `TENSES` 序） |

---

## 9. 本地持久化

| Key | API | 内容 |
| --- | --- | --- |
| `my-verbs` | `LocalStorage` | `string[]`，词库内合法原形 |

无云同步、无 Raycast Preferences。临时文件（TTS mp3、cell PNG）在系统 tmp，可清。

---

## 10. 与相邻项目的关系

作者生态中还有 **Frdic Pronounce** 等 Raycast 扩展（独立仓库/目录）。  
本扩展只复用了 frdic 发音 API 思路，**不依赖**那套翻译/代理/LocalStorage 开关。  
改发音时只动 `src/speech.ts`。

---

## 11. 给 AI 的协作指引

### 改功能前

1. 读本文件对应章节。  
2. 只打开相关 `src/*`；不要加载整份 `verbs.json` 到上下文。  
3. 需要样例结构时用 `être` / `aller` 或 `node -e` 抽查。

### 安全改动区

- UI 文案、快捷键、Action 布局：`lookup.tsx` / `practice.tsx` / `pick-verb.tsx` / `edit-mine.tsx`  
- 选词/启动：`launch.ts` / `open-verb.tsx`  
- 判分/搜索/表：`model.ts`  
- 我的动词：`mine.ts`  
- 发音：`speech.ts`  
- 练习格外观：`cell-image.ts`（改 key 版本后缀以失效旧缓存）

### 高风险 / 需谨慎

- 替换或重生成 `verbs.json`（格式必须保持 `VerbBook`）  
- 改变 `TENSES` / `ROWS` 顺序（全库下标会错）  
- 合并 Practice 的 selection 与 search 逻辑时保留 lock/echo  
- 许可：上游数据 CC BY-NC-SA 4.0 vs 扩展 MIT

### 不要做的事

- 不要引入重型 UI 库或 canvas 依赖（当前零 runtime 依赖除 Raycast）。  
- 不要假设有复合时态数据。  
- 不要把「我的动词」写进 `verbs.json`。  
- 不要手改 `raycast-env.d.ts`（改 `package.json` 后由工具生成）。

### 验证建议

```bash
cd /Users/codiy/Repos/raycast-extensions/french-verb-conjugation
npm run dev    # 在 Raycast 里手动点 Conjugate / Practice
npm run lint
node -e 'const b=require("./src/verbs.json"); console.log(b.source,b.version,Object.keys(b.verbs).length,b.common.length)'
```

手动回归清单：

- 选中 `être` 启动 Conjugate 出表  
- 搜索 `etre`（无重音）能找到  
- Practice 填写、回车换格、`⌘↩` 对错高亮  
- 分词模式 / 布局切换  
- 编辑我的动词、随机我的  
- 朗读某一时态有声  

---

## 12. 一句话心智模型

> **离线精简版学术院变位表（6358）+ Raycast 查表/默写 UI；我的动词本地收藏；发音走 frdic；练习格是自己画的 PNG，不是 markdown 表格。**

数据血缘：

`Académie française 9e` → 上游 repo `ShingZhanho/verbe-conjugaison-academie-francaise` → 转换打包 → `src/verbs.json`（`academie-francaise-9e` @ `v0.5.0`）→ `data.book` → Conjugate / Practice。

---

## 13. 文件—概念索引

| 概念 | 文件 |
| --- | --- |
| Manifest / 命令注册 | `package.json` |
| 变位数据 | `src/verbs.json`, `src/data.ts` |
| h aspiré | `src/h-aspire.json` |
| 类型与纯逻辑 | `src/model.ts` |
| 查词 UI | `src/lookup.tsx` |
| 练习 UI | `src/practice.tsx` |
| 选词 | `src/pick-verb.tsx`, `src/open-verb.tsx`, `src/launch.ts` |
| 收藏 | `src/mine.ts`, `src/edit-mine.tsx` |
| TTS | `src/speech.ts` |
| 格子渲染 | `src/cell-image.ts`, `src/font.json` |
| 上游数据源 | https://github.com/ShingZhanho/verbe-conjugaison-academie-francaise |

---

*生成说明：基于仓库源码与 README 整理；词库统计以当前 `verbs.json` 为准。若代码与本文冲突，以源码为准并更新本文。*
