#!/usr/bin/env python3
"""Build a compact French noun lexicon from the official LeXiK TSV exports.

Usage: python3 scripts/build-noun-database.py /path/to/lexik/downloads
The download directory must contain lexik_lemmes.tsv.gz and lexik_formes_mots.tsv.gz.
"""
import csv
import gzip
import json
import math
import sqlite3
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "assets" / "noun-lexicon.sqlite"


def rows(path):
    with gzip.open(path, "rt", encoding="utf-8", newline="") as file:
        yield from csv.DictReader(file, delimiter="\t", quoting=csv.QUOTE_NONE)


def props(raw):
    return dict(item.split(":", 1) for item in raw.split(";") if ":" in item)


def norm(s):
    return unicodedata.normalize("NFC", s).lower()


def value(row, name):
    try:
        return max(0.0, float(row.get(name) or 0))
    except ValueError:
        return 0.0


def score(row):
    # Average of three log-scaled frequencies (per million words): dialogue,
    # Wikipedia and books, to reduce bias towards a single corpus.
    return sum(math.log1p(value(row, field)) for field in (
        "freq_opensubtitles", "freq_wikipedia", "freq_gutenberg"
    )) / 3


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    data_dir = Path(sys.argv[1])
    all_nouns = []
    for row in rows(data_dir / "lexik_lemmes.tsv.gz"):
        if row["upos"] != "NOUN" or not row["lemme"]:
            continue
        p = props(row["proprietes"])
        all_nouns.append((row, p, score(row)))

    entries = []
    for row, p, rank in all_nouns:
        entries.append({
            "id": row["id_lemme"],
            "lemma": row["lemme"],
            "gender": [g for g in ("m", "f") if g in p.get("genre", "").split(",")],
            "plurals": [s.strip() for s in p.get("pluriel", "").split(",") if s.strip()],
            "feminine": [s.strip() for s in p.get("feminin", "").split(",") if s.strip()],
            "masculine": [s.strip() for s in p.get("masculin", "").split(",") if s.strip()],
            "invariable": p.get("invariable") == "oui",
            "score": round(rank, 5),
            "forms": [],
            "onset": "unknown",
        })
    by_id = {e["id"]: e for e in entries}
    vowels = set("aàâäæeéèêëiîïoôöœuùûü")
    for row in rows(data_dir / "lexik_formes_mots.tsv.gz"):
        entry = by_id.get(row["id_lemme"])
        if not entry or row["upos"] != "NOUN":
            continue
        form = row["ortho"]
        if not form:
            continue
        markers = row["multext"].split(";")
        genders = sorted({"m" if x.startswith("Ncm") else "f" for x in markers
                          if x.startswith(("Ncm", "Ncf"))})
        numbers = sorted({"s" if x.startswith(("Ncms", "Ncfs")) else "p"
                          for x in markers if x.startswith(("Ncms", "Ncfs", "Ncmp", "Ncfp"))})
        if genders and numbers:
            entry["forms"].append({"text": form, "genders": genders, "numbers": numbers})
        if norm(form) == norm(entry["lemma"]) and row.get("phone"):
            initial = norm(form)[0]
            if initial == "h":
                entry["onset"] = "aspirated-h" if "*h*" in row["phone"] else "mute-h"
            elif initial in ("y", "ÿ"):
                # Initial Y may be a vowel or a consonantal glide; spelling
                # alone is insufficient to determine elision reliably.
                entry["onset"] = "unknown"
            elif initial in vowels:
                entry["onset"] = "vowel"
            else:
                entry["onset"] = "consonant"

    entries.sort(key=lambda e: (-e["score"], e["lemma"], e["id"]))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temp = OUTPUT.with_suffix('.sqlite.tmp')
    if temp.exists():
        temp.unlink()
    db = sqlite3.connect(temp)
    try:
        db.executescript('''
          CREATE TABLE entries (id TEXT PRIMARY KEY, lemma_key TEXT NOT NULL, score REAL NOT NULL, data TEXT NOT NULL);
          CREATE TABLE forms (form_key TEXT NOT NULL, entry_id TEXT NOT NULL, PRIMARY KEY(form_key, entry_id)) WITHOUT ROWID;
          CREATE INDEX entries_lemma ON entries(lemma_key);
        ''')
        for e in entries:
            db.execute('INSERT INTO entries VALUES (?, ?, ?, ?)', (e['id'], norm(e['lemma']), e['score'], json.dumps(e, ensure_ascii=False, separators=(',', ':'))))
            keys = {norm(e['lemma'])} | {norm(f['text']) for f in e['forms']}
            db.executemany('INSERT INTO forms VALUES (?, ?)', ((key, e['id']) for key in keys))
        db.commit()
        assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    finally:
        db.close()
    temp.replace(OUTPUT)
    print(f"Wrote {len(entries)} noun entries to {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
