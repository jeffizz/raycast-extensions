#!/usr/bin/env python3
"""Build a compact SQLite index of LeXiK verb and auxiliary forms.

Usage: python3 scripts/build-lexik-db.py
Sources are cached in scripts/lexik-cache/; output is assets/lexik-verbs.sqlite.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import sqlite3
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "scripts" / "lexik-cache"
OUTPUT = ROOT / "assets" / "lexik-verbs.sqlite"
BASE_URL = "https://lexique.lectura.world/telechargements/lexik/"
FILES = {
    "lexik_formes_mots.tsv.gz": "43df3316f4efb4b4192bbd04e15a2abf647b92839313132ffac470008f1bdf6d",
    "lexik_lemmes.tsv.gz": "a4ed2ad413883f1adc116fd99cabc1dc64568deed8e096247dbe749d6e819c23",
    "annexes/lexik_multext.tsv.gz": "cb4b01ed3359cd9af94b99f916965b82a70085e9da246b9702ee72694dfab665",
}


def download_and_verify() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    for relative, expected in FILES.items():
        path = CACHE / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            url = BASE_URL + relative
            print(f"Downloading {url}", file=sys.stderr)
            urllib.request.urlretrieve(url, path)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != expected:
            raise SystemExit(f"SHA-256 mismatch for {path}: expected {expected}, got {digest}")


def search_key(text: str) -> str:
    unaccented = "".join(
        char for char in unicodedata.normalize("NFD", text)
        if not unicodedata.combining(char)
    )
    return unaccented.replace("œ", "oe").replace("æ", "ae")


def read_tsv_gz(path: Path):
    with gzip.open(path, "rt", encoding="utf-8", newline="") as stream:
        yield from csv.DictReader(stream, delimiter="\t", quoting=csv.QUOTE_NONE)


def main() -> None:
    download_and_verify()

    # Keep ordinary verbs and auxiliaries; LeXiK classifies them separately.
    lemmas: dict[str, tuple[str, str]] = {}
    for row in read_tsv_gz(CACHE / "lexik_lemmes.tsv.gz"):
        if row.get("upos") in {"VERB", "AUX"}:
            lemmas[row["id_lemme"]] = (row["lemme"], row["upos"])

    tag_features: dict[str, tuple[str, str]] = {}
    for row in read_tsv_gz(CACHE / "annexes" / "lexik_multext.tsv.gz"):
        if row.get("upos") in {"VERB", "AUX"}:
            tag_features[row["multext"]] = (row["upos"], row.get("feats", ""))

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUTPUT.with_suffix(".sqlite.tmp")
    tmp.unlink(missing_ok=True)
    db = sqlite3.connect(tmp)
    try:
        db.executescript("""
            PRAGMA page_size=4096;
            PRAGMA journal_mode=OFF;
            PRAGMA synchronous=OFF;
            CREATE TABLE metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            ) WITHOUT ROWID;
            CREATE TABLE lemmas (
              id INTEGER PRIMARY KEY,
              lemma TEXT NOT NULL,
              upos TEXT NOT NULL CHECK (upos IN ('VERB', 'AUX'))
            );
            CREATE TABLE spellings (
              id INTEGER PRIMARY KEY,
              ortho TEXT NOT NULL COLLATE BINARY,
              search_key TEXT NOT NULL
            );
            CREATE INDEX idx_spellings_exact ON spellings(ortho);
            CREATE INDEX idx_spellings_search_key ON spellings(search_key);
            CREATE TABLE tags (
              id INTEGER PRIMARY KEY,
              multext TEXT NOT NULL UNIQUE,
              feats TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE analyses (
              spelling_id INTEGER NOT NULL REFERENCES spellings(id),
              lemma_id INTEGER NOT NULL REFERENCES lemmas(id),
              tag_id INTEGER NOT NULL REFERENCES tags(id),
              PRIMARY KEY (spelling_id, lemma_id, tag_id)
            ) WITHOUT ROWID;
        """)
        db.executemany(
            "INSERT INTO lemmas(id, lemma, upos) VALUES (?, ?, ?)",
            [(i, lemma, upos) for i, (_, (lemma, upos)) in enumerate(lemmas.items(), 1)],
        )
        lemma_ids = {key: i for i, key in enumerate(lemmas, 1)}

        tag_ids = {tag: i for i, tag in enumerate(tag_features, 1)}
        db.executemany(
            "INSERT INTO tags(id, multext, feats) VALUES (?, ?, ?)",
            [(tag_ids[tag], tag, feats) for tag, (_, feats) in tag_features.items()],
        )

        spelling_ids: dict[str, int] = {}
        spelling_rows = []
        analysis_rows = []
        count = 0

        def flush() -> None:
            if spelling_rows:
                db.executemany("INSERT INTO spellings VALUES (?, ?, ?)", spelling_rows)
                spelling_rows.clear()
            if analysis_rows:
                db.executemany("INSERT INTO analyses VALUES (?, ?, ?)", analysis_rows)
                analysis_rows.clear()

        for row in read_tsv_gz(CACHE / "lexik_formes_mots.tsv.gz"):
            key = row.get("id_lemme", "")
            if row.get("upos") not in {"VERB", "AUX"} or key not in lemma_ids:
                continue
            ortho = row["ortho"]
            spelling_id = spelling_ids.get(ortho)
            if spelling_id is None:
                spelling_id = len(spelling_ids) + 1
                spelling_ids[ortho] = spelling_id
                spelling_rows.append((spelling_id, ortho, search_key(ortho)))
            for tag in row.get("multext", "").split(";"):
                if tag in tag_ids:
                    analysis_rows.append((spelling_id, lemma_ids[key], tag_ids[tag]))
                    count += 1
            if len(analysis_rows) >= 10000:
                flush()
        flush()

        db.executemany("INSERT INTO metadata VALUES (?, ?)", [
            ("source", "LeXiK by Lectura"),
            ("source_version", "1.0 (base LeXiK 1.2.4, 2026-10-15)"),
            ("source_license", "CC BY-SA 4.0"),
            ("source_url", "https://lexique.lectura.world/lexik"),
            ("included_upos", "VERB,AUX"),
            ("form_analysis_count", str(count)),
            ("attribution", "LeXiK — lexique phonétique et grammatical du français, version 1.0, Maxime Carrière / Lectura, 2026. CC BY-SA 4.0."),
        ])
        db.commit()
        db.execute("VACUUM")
    finally:
        db.close()
    tmp.replace(OUTPUT)

    check = sqlite3.connect(OUTPUT)
    lemma_count = check.execute("SELECT COUNT(*) FROM lemmas").fetchone()[0]
    spelling_count = check.execute("SELECT COUNT(*) FROM spellings").fetchone()[0]
    analysis_count = check.execute("SELECT COUNT(*) FROM analyses").fetchone()[0]
    sample = check.execute(
        "SELECT s.ortho, l.lemma, l.upos, t.multext, t.feats "
        "FROM analyses a JOIN spellings s ON s.id=a.spelling_id "
        "JOIN lemmas l ON l.id=a.lemma_id JOIN tags t ON t.id=a.tag_id "
        "WHERE s.search_key='peut' ORDER BY l.lemma, t.multext"
    ).fetchall()
    check.close()
    print(f"Built {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
    print(f"Lemmas: {lemma_count:,}; spellings: {spelling_count:,}; analyses: {analysis_count:,}")
    print("Lookup `peut`:")
    for record in sample:
        print("  " + " | ".join(record))


if __name__ == "__main__":
    main()
