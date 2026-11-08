# Offline noun data

`assets/noun-lexicon.sqlite` is derived from the LeXiK French lexical database by Lectura (https://lexique.lectura.world/). It uses `lexik_lemmes.tsv.gz` and `lexik_formes_mots.tsv.gz` from the official LeXiK download distribution. The data are licensed under **Creative Commons Attribution–ShareAlike 4.0 International**: https://creativecommons.org/licenses/by-sa/4.0/.

The project source code's MIT licence does not replace the separate CC BY-SA licence on the derived lexical dataset. See the upstream licensing information at https://lexique.lectura.world/licences and the upstream distribution's `LICENSE` file. LeXiK integrates information from multiple open lexical resources; consult the upstream distribution and licensing page for their attribution and provenance.

## 数据库统计与覆盖范围

详细中文统计见 [离线名词库统计报告](docs/NOUN_DATABASE_REPORT.md)，包含规模、性别、单复数、阴阳关联、词首标记、字段和完整性检查。

当前仅保留 LeXiK 标为 `NOUN` 的词元，**不包括 `PROPN` 专有名词**。因此 `France`、`Italie` 等原始数据中的专有名词尚未收录；同名的普通名词不能直接当作国家使用。报告由 `scripts/audit-noun-database.py` 只读审计生成，不修改 SQLite。

## Transformation

`scripts/build-noun-database.py` keeps every LeXiK lemma tagged NOUN, including capitalized and gender-unknown entries. It retains their inflected forms, gender, phonetic onset, and source identifiers. Results are ordered by the average of `log(1 + frequency)` from the OpenSubtitles, Wikipedia and Gutenberg frequency columns. This is a pragmatic ordering, not a CEFR proficiency list.

The data do **not** encode complete sense-level meaning, countability, or usage constraints. In particular, a generated article + noun form is a morphological possibility, not a claim that the combination is appropriate for every sense. When interpreting H-initial words, `*h*` in the source phonetic field is treated as aspirated H; a supplied phonetic field without that marker is treated as mute H. These fields are dataset-derived and may contain errors.

## Rebuild

Download the two official compressed TSV files and their checksum file, verify the SHA-256 checksums, then run:

```sh
python3 scripts/build-noun-database.py /path/to/lexik/downloads
```

The extension ships the derived SQLite database and queries it read-only using macOS `/usr/bin/sqlite3`. The original TSV downloads need not be committed.

DeepL translations are generated separately on demand, are not source-dictionary definitions, and can vary with context. frdic speech audio is a separate online service.
