#!/usr/bin/env python3
"""Read-only noun database audit. Write docs/NOUN_DATABASE_REPORT.md.
Usage: python3 scripts/audit-noun-database.py [path/to/lexik_lemmes.tsv.gz]
"""
import collections
import csv
import datetime
import gzip
import hashlib
import json
import sqlite3
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATABASE = ROOT / 'assets/noun-lexicon.sqlite'
REPORT = ROOT / 'docs/NOUN_DATABASE_REPORT.md'


def normalized(text):
    return unicodedata.normalize('NFC', text).lower()


def table(headers, rows):
    def escape(cell):
        return str(cell).replace('|', '\\|').replace('\n', '<br>')
    return '\n'.join(['| ' + ' | '.join(map(escape, headers)) + ' |',
                      '| ' + ' | '.join(['---'] * len(headers)) + ' |'] +
                     ['| ' + ' | '.join(map(escape, row)) + ' |' for row in rows])


def main():
    db = sqlite3.connect(DATABASE.as_uri() + '?mode=ro', uri=True)
    count = db.execute('SELECT count(*) FROM entries').fetchone()[0]
    totals = collections.Counter()
    genders = collections.Counter()
    onsets = collections.Counter()
    numbers = collections.Counter()
    form_genders = collections.Counter()
    lemma_gender = collections.defaultdict(set)
    ids = set()
    spellings = set()
    links = []
    actual_fields = set()
    examples = {}
    for ident, raw in db.execute('SELECT id,data FROM entries'):
        entry = json.loads(raw)
        actual_fields.update(entry)
        ids.add(ident)
        word = entry['lemma']
        spellings.add(word)
        genders['/'.join(entry['gender']) or 'unknown'] += 1
        onsets[entry['onset']] += 1
        lemma_gender[normalized(word)].update(entry['gender'])
        if word[:1].isupper(): totals['capitalized'] += 1
        if entry['score'] > 0: totals['positive_score'] += 1
        if entry['invariable']: totals['invariable'] += 1
        if entry['plurals']: totals['plural_property'] += 1
        if entry['feminine']: totals['feminine_link'] += 1
        if entry['masculine']: totals['masculine_link'] += 1
        if entry['feminine'] or entry['masculine']: totals['any_link'] += 1
        for kind in ('feminine', 'masculine'):
            links.extend((word, target, kind) for target in entry[kind])
        forms = entry['forms']
        if not forms: totals['no_forms'] += 1
        if any('s' in form['numbers'] for form in forms): totals['has_singular'] += 1
        if any('p' in form['numbers'] for form in forms): totals['has_plural'] += 1
        if any('s' in f['numbers'] for f in forms) and any('p' in f['numbers'] for f in forms): totals['both_numbers'] += 1
        if any('s' in f['numbers'] and normalized(f['text']) == normalized(word) for f in forms): totals['lemma_singular'] += 1
        totals['form_objects'] += len(forms)
        for form in forms:
            numbers['/'.join(sorted(form['numbers'])) or 'unknown'] += 1
            form_genders['/'.join(sorted(form['genders'])) or 'unknown'] += 1
        if word in ('cour', 'cours', 'course', 'Chinois', 'Chinoise', 'anglais', 'France', 'Italie', 'Canada', 'Suisse'):
            examples[ident] = entry
    index_rows = db.execute('SELECT count(*) FROM forms').fetchone()[0]
    keys = db.execute('SELECT count(DISTINCT form_key) FROM forms').fetchone()[0]
    ambiguous = db.execute('SELECT count(*) FROM (SELECT form_key FROM forms GROUP BY form_key HAVING count(*) > 1)').fetchone()[0]
    max_hits = db.execute('SELECT max(n) FROM (SELECT count(*) n FROM forms GROUP BY form_key)').fetchone()[0]
    multi_lemma = db.execute('SELECT count(*) FROM (SELECT lemma_key FROM entries GROUP BY lemma_key HAVING count(*) > 1)').fetchone()[0]
    normalized_spellings = {normalized(s) for s in spellings}
    link_set = {(normalized(a), normalized(b)) for a, b, _ in links}
    resolvable = sum(normalized(b) in normalized_spellings for _, b, _ in links)
    reciprocal = sum((normalized(b), normalized(a)) in link_set for a, b, _ in links)
    raw_counts = collections.Counter()
    raw_countries = []
    country_names = ('France', 'Italie', 'Canada', 'Chine', 'Japon', 'Suisse', 'Paris')
    if len(sys.argv) > 1:
        with gzip.open(sys.argv[1], 'rt', encoding='utf8', newline='') as source:
            for row in csv.DictReader(source, delimiter='\t', quoting=csv.QUOTE_NONE):
                raw_counts[row['upos']] += 1
                if row['lemme'] in country_names:
                    raw_countries.append((row['lemme'], row['upos'], row['proprietes']))
    hasher = hashlib.sha256()
    with DATABASE.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            hasher.update(block)
    digest = hasher.hexdigest()
    percent = lambda n: f'{n:,}（{n/count:.2%}）'
    sections = [
        '# 离线名词库统计报告',
        f'\n统计日期：{datetime.date.today().isoformat()}（运行脚本的本地日期）。\n\n数据库：`assets/noun-lexicon.sqlite`。本报告直接读取本地 SQLite，不请求网络，不修改数据库。\n\nSHA-256：`{digest}`。',
        '\n## 1. 统计口径与覆盖范围\n\n* 条目数按 LeXiK `id_lemme` 计数，不等于独立词义数或词汇量。同一拼写可以有多个条目。\n* 当前仅保留原始词元表 `upos=NOUN` 的条目，**不包含 PROPN 专有名词**；“全部名词”准确地说是“此次原始快照中全部 NOUN 词元”。\n* 区分大小写的拼写、转为小写后的拼写、屈折词形和索引行数是不同指标。\n* 性别和词形是来源数据标签，不是已人工核实的语法事实；多性别可能来自不同意义、语体或数量。\n* 本库没有完整词义、国名类别、可数性、常用冠词或 CEFR 标签，不能据此统计国家、职业、语言或不可数名词的准确数量。',
        '\n## 2. 规模与结构\n\n' + table(['指标', '数量'], [
            ('词元条目', f'{count:,}'), ('区分大小写的原形拼写', f'{len(spellings):,}'),
            ('小写归一化的原形键', f'{len(normalized_spellings):,}'), ('多个条目共用同一原形键', f'{multi_lemma:,}'),
            ('屈折词形对象（含重复拼写）', f'{totals["form_objects"]:,}'),
            ('索引行（词形键 + 词元 ID）', f'{index_rows:,}'), ('独立可检索词形键（含原形）', f'{keys:,}'),
            ('一个词形键命中多个条目', f'{ambiguous:,}'), ('单个词形键最多命中条目', max_hits),
            ('数据库字节数', f'{DATABASE.stat().st_size:,}'), ('数据库 MiB', f'{DATABASE.stat().st_size / 1024**2:.2f}')]),
        '\n数据库表：\n\n* `entries(id, lemma_key, score, data)`：`id` 主键，`lemma_key` 索引；`data` 是单个条目的 JSON。\n* `forms(form_key, entry_id)`：复合主键；用于精确词形查询，不是全文搜索。\n* 查询命中后仅解析命中条目，不把整库载入 JavaScript。索引包含原形本身，即使没有可用屈折词形也可能查到条目。',
        '\n## 3. 条目性别\n\n' + table(['来源标签', '条目数 / 占比'], [(label, percent(genders[key])) for key, label in [('m','仅阳性 n.m.'),('f','仅阴性 n.f.'),('m/f','同条目同时有 m、f'),('unknown','性别未提供')]]) +
        f'\n\n另有 **{sum(g == {"m", "f"} for g in lemma_gender.values()):,}** 个归一化原形键在汇总各条目后同时包含 m、f。这不是同条目双性别数，也不是男女对应变体数量。',
        '\n## 4. 单复数与词形完整度\n\n' + table(['指标', '条目数 / 占比'], [
            ('无可用 forms 对象', percent(totals['no_forms'])), ('至少一个单数词形', percent(totals['has_singular'])),
            ('至少一个复数词形', percent(totals['has_plural'])), ('单复数均有', percent(totals['both_numbers'])),
            ('原形本身有单数词形', percent(totals['lemma_singular'])), ('提供 plurals 属性', percent(totals['plural_property'])),
            ('invariable=true', percent(totals['invariable']))]) +
        '\n\n词形对象数量标签分布：\n\n' + table(['标签组合', '词形对象数'], sorted(numbers.items())) +
        '\n\n注意：生成器仅把具备可解析性别与性数标签的词形写入 `forms` 数组。因此“无 forms”不等于现实中没有单复数。`invariable` 只描述来源中的词形属性，不等于不可数。',
        '\n## 5. 阴阳关联字段\n\n' + table(['指标', '数量'], [
            ('有 feminine 目标的条目', totals['feminine_link']), ('有 masculine 目标的条目', totals['masculine_link']),
            ('至少一个关联方向的条目', totals['any_link']), ('目标引用总数（有方向，可重复）', len(links)),
            ('目标原形在库中存在（忽略大小写）', resolvable), ('目标原形不在库中（忽略大小写）', len(links)-resolvable),
            ('反向引用存在（忽略大小写）', reciprocal)]) +
        '\n\n目标存在并不证明语义相同。界面中的 `inferredLink` 是运行时根据大小写与双向关系产生的标记，**不存储在 SQLite 中，也不包含在以上统计**。程序没有通用“加 e 就关联”的规则。',
        '\n## 6. 词首发音与省音标记\n\n' + table(['onset', '条目数 / 占比'], [(key, percent(onsets[key])) for key in ['consonant','vowel','aspirated-h','mute-h','unknown']]) +
        '\n\n* `aspirated-h`：来自原形发音字段的 `*h*` 标记。\n* `mute-h`：来源给了原形发音且没有 `*h*`，这是生成器的解释，不是额外人工核验。\n* `vowel` / `consonant`：来源存在原形发音时按拼写开头分类；Y 开头保守设为 unknown。\n* `unknown`：可能因为缺少原形发音或 Y 等特殊情形；库内没有保留完整 IPA，只有分类结果。',
        '\n## 7. 排序与原始字段\n\n' + table(['指标', '数量'], [
            ('score > 0', totals['positive_score']), ('score = 0', count-totals['positive_score']), ('首字母大写的原形条目', totals['capitalized'])]) +
        '\n\n`score` 是三个语料频率的 `log(1+频率)` 平均值，保留五位小数，仅用于排序。缺失频率按 0 处理；分数为 0 不代表词不存在或绝对不常用。原始三列频率未保留在派生库中。\n\n当前 JSON 字段：`' + '`, `'.join(sorted(actual_fields)) + '`。\n\n原始词形表中的完整音标、置信度、对齐等字段未保留；释义、例句和主题类别也不在本派生库中。PROPN 词元及其类型属性未纳入。',
        '\n## 8. 国家与专有名词为什么查不到\n\n`France`、`Italie`、`Paris` 在当前库中都没有原形条目。原因是构建时只选 NOUN；不是 SQLite 查询速度或索引故障。'
    ]
    if raw_counts:
        sections.append('\n原始 TSV 核验：\n\n' + table(['词性', '原始词元条目数'], [('NOUN', f'{raw_counts["NOUN"]:,}'), ('PROPN', f'{raw_counts["PROPN"]:,}'), ('全部词性合计', f'{sum(raw_counts.values()):,}')]) +
                        '\n\n' + table(['原形', '原始词性', '原始属性（未经语义消歧）'], raw_countries))
    else:
        sections.append('\n本次未提供原始 TSV；可用脚本参数补充原始词性核验。')
    sections.extend([
        '\n重要风险：\n\n* 同名 NOUN 不能直接当作国家，例如本库 `Canada#NOUN` 标为阴性，而原始 `Canada#PROPN` 标为阳性。\n* `Suisse#NOUN` 的 m/f 不能用于推断国家的性别。\n* 原始 `France#PROPN` 合并了多种用途并标 m/f，不能直接当作国家 France 的精确性别规则。\n* 加入国名需要独立的国名类别、性别和冠词策略，不宜将所有 PROPN 不加区分地并入并生成 un/une。此次审计**没有修改数据库**。',
        '\n## 9. 同形歧义实例\n\n' + table(['词元', '性别', '库中词形（文本 : 数量）', '显式阴阳关联'], [
            (examples[k]['lemma'], '/'.join(examples[k]['gender']), '; '.join(f["text"] + ':' + '/'.join(f['numbers']) for f in examples[k]['forms']), ', '.join(examples[k]['feminine'] + examples[k]['masculine']) or '无')
            for k in ('cours#NOUN', 'cour#NOUN', 'course#NOUN') if k in examples]) +
        '\n\n`cours` 同时命中 cours 原形与 cour 的复数，是同形异词，不是阴阳配对。仅看命中词形或性别不足以判断词义。',
        '\n## 10. 数据库健康检查\n\n' + table(['检查', '结果'], [
            ('PRAGMA integrity_check', db.execute('PRAGMA integrity_check').fetchone()[0]),
            ('索引引用不存在的词元', db.execute('SELECT count(*) FROM forms f LEFT JOIN entries e ON e.id=f.entry_id WHERE e.id IS NULL').fetchone()[0]),
            ('原形归一化索引遗漏', db.execute('SELECT count(*) FROM entries e WHERE NOT EXISTS (SELECT 1 FROM forms f WHERE f.form_key=e.lemma_key AND f.entry_id=e.id)').fetchone()[0])]) +
        '\n\n健康检查只验证数据库结构与引用一致性，不保证词典语义、性别、词形或发音规则无误。',
        '\n## 11. 如何更新报告\n\n```sh\npython3 scripts/audit-noun-database.py /path/to/lexik_lemmes.tsv.gz\n```\n\n不传原始表参数时仅统计当前 SQLite。原始数据来源与许可见 `../NOUN_DATA_SOURCES.md`。DeepL 翻译和 frdic 音频缓存位于运行时存储，不属于只读词库，因此不计入本报告。'
    ])
    db.close()
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text('\n\n'.join(sections) + '\n', encoding='utf8')
    print(f'Wrote {REPORT}; {count:,} noun entries; {keys:,} indexed spellings.')


if __name__ == '__main__':
    main()
