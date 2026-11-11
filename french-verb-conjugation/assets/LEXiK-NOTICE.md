# LeXiK data notice

`lexik-verbs.sqlite` is a derived, verb-and-auxiliary-only database built from **LeXiK — lexique phonétique et grammatical du français**, version 1.0 (base 1.2.4, 15 October 2026), by Maxime Carrière / Lectura.

* Source: https://lexique.lectura.world/lexik
* Citation: CARRIÈRE, Maxime (2026). *LeXiK — lexique phonétique et grammatical du français*, version 1.0. Lectura. ORTOLANG. https://hdl.handle.net/11403/lexik/v1.0
* Licence: Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/
* Included analyses: LeXiK `VERB` and `AUX` entries only. `AUX` is kept because it includes useful lookup targets such as `être` and `avoir`.
* The database is a transformed selection of LeXiK data. The LeXiK-derived database is distributed under CC BY-SA 4.0; this notice and attribution accompany it.

Rebuild from the official source files with:

```sh
python3 scripts/build-lexik-db.py
```

The script downloads the official gzip TSV files, verifies their SHA-256 checksums, and writes `assets/lexik-verbs.sqlite`. Cached source files are kept in `scripts/lexik-cache/` and are not needed at runtime.
