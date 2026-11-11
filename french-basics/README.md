# French Basics

法语基础词汇、离线名词性别与冠词查询，以及选中名词快捷发音。

## 命令

* **French Basics**：字母、数字、时间、日期等基础词汇。26 个字母使用内置离线音频。
* **French Noun Lookup**：优先读取选区，再回退剪贴板；也可手动输入。使用本地 SQLite 按需查询词形、阴阳性及冠词搭配，可选 DeepL 中文翻译。
* **Speak Selected French Noun**：只读取选区，不回退剪贴板。按输入数量朗读：确定复数的裸词用 `des`，显式 `les/des` 保留；单数或数量不明时默认用单数不定冠词。相关阴阳形式使用 `?` + Tab 合为一个发音请求。同形异词优先选原形一致的候选，再按词频选择，HUD 简短提示“有歧义”。不调用翻译 API。

## French Basics 时间与日期

* 在搜索框输入 24 小时制 `14:30`、`9:05` 等，显示法语时间；`00:00` 和 `12:00` 还提供 `minuit` 和 `midi`。输入 `1:05` 时分钟不会读出前导零。
* 输入 `YYYY-MM-DD` 或 `YYYY/MM/DD`，例如 `2024-02-29`，显示包含星期、日期和年份的法语表达。支持 0001–9999 年；闰年和无效日期会校验。每月 1 日使用 `premier`。
* 选择卡片后按回车朗读，或使用 `⌘C` 复制表达。时间和日期结果不受分类筛选影响；不输入内容时也可以通过分类浏览示例。
* 数字输入本身仍沿用原有解析和范围行为；时间、日期使用独立的格式校验。

## 离线词库与统计

完整审计报告见 **[离线名词库统计报告](docs/NOUN_DATABASE_REPORT.md)**。

当前快照包含 **217,755 条 NOUN 词元**、**376,572 个可检索归一化词形键**，SQLite 大小为 **95,174,656 字节（90.77 MiB）**。条目数并不等于独立词义数。

**覆盖边界：**当前只收录 LeXiK 的 `NOUN`，不含 `PROPN` 专有名词，因此 `France`、`Italie` 等暂未收录。部分同名普通名词虽然能查到，也不能据其性别推断对应国名。扩充国名需要单独核验类别、性别和冠词，不能盲目导入所有专有名词。

* SQLite 以只读索引查询，不将整库载入 JavaScript 堆。
* 当前库包含性别、单复数、关联词形和词首类别，没有完整词义与可数性分类。冠词组合是词形搭配提示，不保证适用于所有语境。
* 词库不是按词尾生成阴阳性；显式关联、同形异词与大小写推断关联应区别理解。
* 数据来源和独立许可证见 [NOUN_DATA_SOURCES.md](NOUN_DATA_SOURCES.md)。源代码的 MIT 声明不替代词库的 CC BY-SA 4.0。

## 翻译、发音与缓存

* 在 French Basics 扩展设置中配置 DeepL API Key 与 Free/Pro 套餐；只供名词查询界面使用。
* 中文是 DeepL 机器翻译，不是按义项核实的词典定义。只请求可靠的单数词组，复数行不显示单数译文。
* 翻译使用 Raycast LocalStorage 缓存，键保留大小写。
* frdic 音频保存在扩展 supportPath 的 `speech-cache` 下；有效缓存命中后不联网。单个词组和多个词组合成音频分别缓存。
* 除内置字母外，未缓存的发音需要联网。

## 开发与校验

```sh
npm run dev
npm run build
./node_modules/.bin/ray validate
node scripts/test-numbers.cjs
node scripts/test-date-time.cjs
node scripts/test-basics-ui.cjs
node --max-old-space-size=100 scripts/test-nouns.cjs
```

从已校验的 LeXiK 原始表重建数据库及报告：

```sh
python3 scripts/build-noun-database.py /path/to/lexik/downloads
python3 scripts/audit-noun-database.py /path/to/lexik/downloads/lexik_lemmes.tsv.gz
```

审计脚本只读数据库并更新 `docs/NOUN_DATABASE_REPORT.md`；不提供原始 TSV 参数时只统计本地 SQLite。
