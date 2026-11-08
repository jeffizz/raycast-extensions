# 离线名词库统计报告


统计日期：2026-11-08（运行脚本的本地日期）。

数据库：`assets/noun-lexicon.sqlite`。本报告直接读取本地 SQLite，不请求网络，不修改数据库。

SHA-256：`ba6439f517b81e02fd2f538c2839be0b2a5e0072fa9752337e1018b9df090530`。


## 1. 统计口径与覆盖范围

* 条目数按 LeXiK `id_lemme` 计数，不等于独立词义数或词汇量。同一拼写可以有多个条目。
* 当前仅保留原始词元表 `upos=NOUN` 的条目，**不包含 PROPN 专有名词**；“全部名词”准确地说是“此次原始快照中全部 NOUN 词元”。
* 区分大小写的拼写、转为小写后的拼写、屈折词形和索引行数是不同指标。
* 性别和词形是来源数据标签，不是已人工核实的语法事实；多性别可能来自不同意义、语体或数量。
* 本库没有完整词义、国名类别、可数性、常用冠词或 CEFR 标签，不能据此统计国家、职业、语言或不可数名词的准确数量。


## 2. 规模与结构

| 指标 | 数量 |
| --- | --- |
| 词元条目 | 217,755 |
| 区分大小写的原形拼写 | 216,873 |
| 小写归一化的原形键 | 213,204 |
| 多个条目共用同一原形键 | 4,489 |
| 屈折词形对象（含重复拼写） | 377,013 |
| 索引行（词形键 + 词元 ID） | 387,121 |
| 独立可检索词形键（含原形） | 376,572 |
| 一个词形键命中多个条目 | 10,208 |
| 单个词形键最多命中条目 | 5 |
| 数据库字节数 | 95,174,656 |
| 数据库 MiB | 90.77 |


数据库表：

* `entries(id, lemma_key, score, data)`：`id` 主键，`lemma_key` 索引；`data` 是单个条目的 JSON。
* `forms(form_key, entry_id)`：复合主键；用于精确词形查询，不是全文搜索。
* 查询命中后仅解析命中条目，不把整库载入 JavaScript。索引包含原形本身，即使没有可用屈折词形也可能查到条目。


## 3. 条目性别

| 来源标签 | 条目数 / 占比 |
| --- | --- |
| 仅阳性 n.m. | 112,657（51.74%） |
| 仅阴性 n.f. | 86,951（39.93%） |
| 同条目同时有 m、f | 10,308（4.73%） |
| 性别未提供 | 7,839（3.60%） |

另有 **10,981** 个归一化原形键在汇总各条目后同时包含 m、f。这不是同条目双性别数，也不是男女对应变体数量。


## 4. 单复数与词形完整度

| 指标 | 条目数 / 占比 |
| --- | --- |
| 无可用 forms 对象 | 9,071（4.17%） |
| 至少一个单数词形 | 204,907（94.10%） |
| 至少一个复数词形 | 191,220（87.81%） |
| 单复数均有 | 187,443（86.08%） |
| 原形本身有单数词形 | 204,718（94.01%） |
| 提供 plurals 属性 | 166,564（76.49%） |
| invariable=true | 22,624（10.39%） |

词形对象数量标签分布：

| 标签组合 | 词形对象数 |
| --- | --- |
| p | 171977 |
| p/s | 22367 |
| s | 182669 |

注意：生成器仅把具备可解析性别与性数标签的词形写入 `forms` 数组。因此“无 forms”不等于现实中没有单复数。`invariable` 只描述来源中的词形属性，不等于不可数。


## 5. 阴阳关联字段

| 指标 | 数量 |
| --- | --- |
| 有 feminine 目标的条目 | 2042 |
| 有 masculine 目标的条目 | 1952 |
| 至少一个关联方向的条目 | 3993 |
| 目标引用总数（有方向，可重复） | 3997 |
| 目标原形在库中存在（忽略大小写） | 3989 |
| 目标原形不在库中（忽略大小写） | 8 |
| 反向引用存在（忽略大小写） | 3983 |

目标存在并不证明语义相同。界面中的 `inferredLink` 是运行时根据大小写与双向关系产生的标记，**不存储在 SQLite 中，也不包含在以上统计**。程序没有通用“加 e 就关联”的规则。


## 6. 词首发音与省音标记

| onset | 条目数 / 占比 |
| --- | --- |
| consonant | 171,043（78.55%） |
| vowel | 38,310（17.59%） |
| aspirated-h | 1,083（0.50%） |
| mute-h | 5,713（2.62%） |
| unknown | 1,606（0.74%） |

* `aspirated-h`：来自原形发音字段的 `*h*` 标记。
* `mute-h`：来源给了原形发音且没有 `*h*`，这是生成器的解释，不是额外人工核验。
* `vowel` / `consonant`：来源存在原形发音时按拼写开头分类；Y 开头保守设为 unknown。
* `unknown`：可能因为缺少原形发音或 Y 等特殊情形；库内没有保留完整 IPA，只有分类结果。


## 7. 排序与原始字段

| 指标 | 数量 |
| --- | --- |
| score > 0 | 114576 |
| score = 0 | 103179 |
| 首字母大写的原形条目 | 59763 |

`score` 是三个语料频率的 `log(1+频率)` 平均值，保留五位小数，仅用于排序。缺失频率按 0 处理；分数为 0 不代表词不存在或绝对不常用。原始三列频率未保留在派生库中。

当前 JSON 字段：`feminine`, `forms`, `gender`, `id`, `invariable`, `lemma`, `masculine`, `onset`, `plurals`, `score`。

原始词形表中的完整音标、置信度、对齐等字段未保留；释义、例句和主题类别也不在本派生库中。PROPN 词元及其类型属性未纳入。


## 8. 国家与专有名词为什么查不到

`France`、`Italie`、`Paris` 在当前库中都没有原形条目。原因是构建时只选 NOUN；不是 SQLite 查询速度或索引故障。


原始 TSV 核验：

| 词性 | 原始词元条目数 |
| --- | --- |
| NOUN | 217,755 |
| PROPN | 411,856 |
| 全部词性合计 | 752,058 |

| 原形 | 原始词性 | 原始属性（未经语义消歧） |
| --- | --- | --- |
| Canada | NOUN | genre:f;invariable:non;pluriel:Canadas |
| Canada | PROPN | genre:m;invariable:non;pluriel:Canadas;type:autre,lieu,patronyme;sous_type:commune |
| Chine | PROPN | genre:f;invariable:non;pluriel:Chines;type:autre,lieu,patronyme,prenom;sous_type:commune |
| France | PROPN | genre:m,f;epicene:oui;invariable:non;pluriel:Frances;type:autre,lieu,patronyme,prenom;sous_type:commune |
| Italie | PROPN | genre:f;invariable:non;pluriel:Italies;type:autre,lieu,prenom |
| Japon | PROPN | genre:m;type:autre,lieu,patronyme |
| Paris | PROPN | genre:m,f;epicene:oui;invariable:oui;type:autre,lieu,patronyme,prenom;sous_type:commune,division_administrative |
| Suisse | NOUN | genre:m,f;epicene:oui;invariable:non;pluriel:Suisses |
| Suisse | PROPN | genre:f;type:autre,lieu,patronyme;sous_type:commune |


重要风险：

* 同名 NOUN 不能直接当作国家，例如本库 `Canada#NOUN` 标为阴性，而原始 `Canada#PROPN` 标为阳性。
* `Suisse#NOUN` 的 m/f 不能用于推断国家的性别。
* 原始 `France#PROPN` 合并了多种用途并标 m/f，不能直接当作国家 France 的精确性别规则。
* 加入国名需要独立的国名类别、性别和冠词策略，不宜将所有 PROPN 不加区分地并入并生成 un/une。此次审计**没有修改数据库**。


## 9. 同形歧义实例

| 词元 | 性别 | 库中词形（文本 : 数量） | 显式阴阳关联 |
| --- | --- | --- | --- |
| cours | m | cours:p/s | 无 |
| cour | f | cour:s; cours:p | 无 |
| course | f | course:s; courses:p | 无 |

`cours` 同时命中 cours 原形与 cour 的复数，是同形异词，不是阴阳配对。仅看命中词形或性别不足以判断词义。


## 10. 数据库健康检查

| 检查 | 结果 |
| --- | --- |
| PRAGMA integrity_check | ok |
| 索引引用不存在的词元 | 0 |
| 原形归一化索引遗漏 | 0 |

健康检查只验证数据库结构与引用一致性，不保证词典语义、性别、词形或发音规则无误。


## 11. 如何更新报告

```sh
python3 scripts/audit-noun-database.py /path/to/lexik_lemmes.tsv.gz
```

不传原始表参数时仅统计当前 SQLite。原始数据来源与许可见 `../NOUN_DATA_SOURCES.md`。DeepL 翻译和 frdic 音频缓存位于运行时存储，不属于只读词库，因此不计入本报告。
