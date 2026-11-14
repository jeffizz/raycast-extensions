# French Vocabulary

English-language, local-first French vocabulary workbench for Raycast on macOS.

## Run

```sh
cd /Users/codiy/Repos/raycast-extensions/french-vocabulary
npm install
npm run dev
```

## Commands

* **Browse Vocabulary** — compact two-pane vocabulary, editing, filters, batch selection, pronunciation, and practice inclusion.
* **Import Vocabulary** — paste Excel TSV or CSV; confirm column mapping and duplicate preview before saving.
* **Practice Vocabulary** — Copy Spelling, Recall Meaning, Recall Spelling, and Noun Gender, with independent FSRS schedules.
* **Confusion Groups** — manually link any words and compare spelling/POS/EN/CN side by side.
* **Archived Vocabulary** — restore words without losing notes or review history.
* **Vocabulary Dashboard** — statistics, SQLite WebDAV backup/restore, and library health.

## Browsing

The dropdown selects **Recently Used** (default), **Import Order**, **Reverse Import Order**, **A → Z**, or **Random**. Random order remains stable until Shuffle Again. Recently Used considers edits, review answers, and viewing a word for approximately half a second. Viewing is persisted without making the list jump under the cursor; refresh/reopen applies the new order.

The list shows only the first POS. **List Part of Speech** selects Right (default), Below Word, or Hidden. One status slot combines familiarity and practice: orange question mark = Fuzzy, green check = Know; a blue ring means included in practice. Included words without familiarity show only an empty blue ring. Legacy Don't Know records appear as Fuzzy. A separate blue check at the left marks temporary batch selection, not familiarity.

The top-right dropdown also offers **Recent Mistakes (7 Days)**: words with a recall error in the seven-day interval ending at the latest recorded recall error, newest error first. This is not anchored to today, so an inactive week does not empty the view. Copy errors and correct attempts do not move the interval. Existing search and filters still apply.

Details use compact POS / translation / translation lines, with a divider only between senses, without EN/CN prefixes. **Translation Display** selects Chinese First (default), English First, Chinese Only, or English Only for details, Senses, comparisons, and practice. Missing translations are omitted; a fully empty sense shows a dash. Notes/examples are user-authored and are not automatically translated or filtered by language. Status symbols share one compact SVG accessory. IPA is hidden by default; Show IPA is available as an action. **Manage Senses** edits the original IPA, POS, translations, noun gender, and number. A sense is one analysis/translation under a word, such as tableau = painting versus tableau = chart. Notes support Markdown; examples are individually editable and pronounceable. Both translation fields remain editable even in a single-language display mode.

### One-hand shortcuts

| Shortcut | Browse action |
| --- | --- |
| ⌘B | Speak word, then un/une/des mnemonic phrases |
| ⌘S | Find similar words |
| ⌘E | Edit word and notes |
| ⌘D | Open Frdic dictionary |
| ⌘T | Add/remove word from practice; if a selection exists, add the selection |
| ⌘X | Select/deselect the current word |
| ⇧⌘X | Select all filtered words |
| ⇧⌘T | Add Selection to Practice (Tag Picker) |
| ⇧⌘C | Clear Selection |
| ⇧⌘E | Toggle Recent Mistakes (7 Days) |
| ⌘G | Add to a confusion group |
| ⇧⌘G | Add selected words to a group |
| ⌘1 / ⌘2 | Mark Fuzzy / Know (top-level actions) |
| ⌘0 | Clear familiarity |
| ⇧⌘F | Filters |
| ⌘R | Refresh |

Batch selection is implemented by the extension using persistent check icons within the current browse session, not Finder-style native range selection.

## Performance and Unicode fixes

The old nested SQLite JSON-aggregation load took about 33 seconds on the actual 1,366-word library; plain-row transactional loading now measured about 43 ms (data loading only, not an end-to-end UI benchmark). Browse initially renders 80 rows and only the selected word gets a detail/action tree. Normal word edits use a targeted row transaction, rather than generating writes for the entire library. Browse currently loads review history to compute the recent-error window; the database benchmark above measures the lighter history-free loading path, not the current full Browse command.

SQLite stdout is decoded after concatenating binary chunks, fixing split UTF-8 sequences. Previously persisted replacement characters cannot be reversed without original text. Reimport original rows to repair uniquely matched damaged translation/IPA fields while retaining word/sense IDs, notes, and review history. Import preview shows a repaired count. Never reset the library to repair two fields.

## Import

Paste five columns in any order: French word, POS, IPA, English, Chinese. Headers have English/French/Chinese aliases. Without a header the French/English assignment is a suggestion that must be confirmed. Quoted multiline cells, escaped quotes, TSV, and CSV are supported.

The supplied `tests/sample.tsv` has 28 rows → 27 word heads and 28 meanings. The two tableau rows retain distinct meanings. chinois(e) and Chinois(e) remain distinct. Original IPA and spelling annotations are preserved. The sample is not automatically loaded into the real library.

Accents and capitalization are significant for identity; search ignores them. Exact lexical duplicates are skipped. Different translations/POS remain separate meanings. Missing fields are filled only when another populated translation matches and there are no conflicting populated fields. New words are automatically included in practice. Reimport does not undo an explicit exclusion.

## Confusion groups and comparisons

Similarity score:

```text
min(1, 0.5 × bigram Dice + 0.5 × normalized Levenshtein similarity
       + 0.15 if one normalized word contains the other)
```

Automatic candidates below **50%** are hidden. Explicit manual group connections are retained regardless of score. There is no semantic/IPA-neighbour model.

From Similar Words use **Link Any Word Manually** even when there are no suggestions, or use ⌘G in Browse. Group members are freely selectable from the entire library. Names automatically use member spellings (e.g. demain · matin · main); names can be customized. **Browse Group Members** opens a full-width comparison table without a member sidebar or selection-dependent reordering. Comparisons use one row per word and separate columns for POS and each selected translation language. All senses are retained within cells. Language columns follow Translation Display. There are no textual column headings; Markdown uses empty header cells. Group notes appear after the compact comparison.

## Pronunciation and annotation cleanup

Stored spelling is unchanged. Speech and spelling practice automatically remove parenthetical/bracket annotations and everything after the first comma, including full-width Chinese punctuation:

* reposer(se) → reposer
* curieux,se → curieux
* sculpteur(trice) → sculpteur
* ancien(ne) → ancien

No manual pronunciation form is required. An optional override remains for unusual cases.

Nouns are spoken once alone, then with **un/une** (or des for plural forms); le/la/les phrases are not spoken. Unknown or ambiguous gender is not guessed. The bundled LeXiK noun extract can fill unambiguous gender/onset data but does not overwrite user/import gender or provide translations. Generated indefinite phrases are mnemonic aids; mass nouns or special usages can use a phrase override.

### Anonymous Frdic pronunciation

* Pronunciation uses only anonymous `/api/v2/speech/speakweb` requests, with French language and Base64-encoded text using the service's `QYN` text prefix (not an account token).
* No account token, speech authorization mode, voice, or speed setting is accepted.
* HTTPS audio redirects are handled with an upper bound; insecure redirects are rejected. The Frdic referer is not forwarded across origins.
* Downloads have a 20 MB limit and audio validation. HTTP/network/non-audio errors never include response bodies.
* The local cache is keyed by anonymous endpoint version and text. Dashboard → Clear Audio Cache removes it.

Actual anonymous network playback still needs hands-on testing.

## Practice

All non-archived words are included by default. Browse → Remove from Practice (⌘T) or Remove Selection from Practice explicitly excludes words; Add to Practice restores inclusion. No vocabulary is copied: `practice` is the only inclusion flag and is mirrored in the SQLite column and word JSON. Loading never migrates false to true. Archiving temporarily excludes a word without changing its practice flag.

Typed answers preserve accents and capitalization. Copy Spelling and Recall Spelling submit and advance immediately when input fully matches the expected spelling (Unicode NFC-equivalent input is accepted). Partial input never counts as an error. Press Check Spelling/Return to check an incorrect answer: it is saved immediately, and the page remains for comparison; Continue advances without saving it twice. Feedback is vertical: Correct spelling above Your input, without per-character highlighting.

* Copy Spelling: vocabulary and full details are visible; copying is tracked separately and does not change FSRS.
* Recall Meaning: left list shows the actual vocabulary. Reveal, then rate Again/Hard/Good/Easy using ⌘1–4.
* Recall Spelling: POS/translations are visible, while the French answer and potentially revealing notes/examples/article phrases stay hidden until Check Spelling. Checking then shows the word, comparison, and full details.
* Noun Gender: ⌘1 = masculine/un, ⌘2 = feminine/une. Ambiguous analyses are excluded.
* ⌘B manually speaks in every mode, including Recall Spelling before checking.
* Dashboard → **Practice Settings** configures auto pronunciation independently for each mode (default Off). Noun Gender omits revealing articles before checking.
* Each mode has its own selected word list and a default scope (Default Library or Selected Words Only). Practice → Word Selection temporarily overrides that scope. Due/new scheduling, group restrictions, global exclusions and archives still apply; an empty selected list produces no cards.
* **⌘⇧E** ends the session, waits for any in-flight answer write, and returns to Practice, including when another queue row is selected. ⌘Return is reserved by Raycast for the secondary action.

Each checked spelling/gender answer and each graded meaning answer is committed immediately to local SQLite, independently of completing the queue. Leaving early does not discard these records, including an error still displayed for comparison. Unchecked partial input is not an answer and is not saved. Copy attempts do not change FSRS; correct recall spelling uses Good, incorrect recall spelling uses Again. A new session builds a new due/new queue from persisted scheduling rather than resuming an exact queue cursor. Answers, End Session and completion check WebDAV backup intervals when enabled; closing the command directly preserves committed local records but does not guarantee remote backup. Short-term due cards are included when starting the next finite session.

## SQLite and WebDAV backup

All reads/edits are local in `environment.supportPath/vocabulary.sqlite`. No per-word WebDAV query. **No manual Local Snapshot task is required.** Safety copies are automatically created before imports/restores/resets; these are internal recovery protection, not the main backup workflow.

1. Create an existing dedicated HTTPS WebDAV folder.
2. Configure its URL, username, and app password in preferences.
3. Dashboard → **Create Full SQLite Backup Now**.
4. Optionally enable Automatic WebDAV Backup. Dashboard → Backup Schedule configures intervals (default: 5 minutes incremental, 24 hours full). Checks happen on command opening, word browsing, edits, and practice answers. No background timer runs while the command is closed. Checks are throttled to once per 15 seconds; Dashboard indicates pending changes.

WebDAV uses **SQLite full snapshots plus JSON logical increments**. A local hash baseline identifies changed word/group/card/review rows; increments contain those rows, collection ID order (also representing deletions), and library settings. This is not a byte-level SQLite/WAL diff: generating an increment reads the local library, and its ID lists grow with library/history size. The normal path only transfers the new increment and index, not the complete SQLite file. A missing baseline, different library, increment over 8 MB, or 128 increments causes a full snapshot. Overdue full snapshots run even without new edits; manual full backup always creates a new snapshot.

Remote:

```text
latest.json
snapshot-<timestamp>-<uuid>.sqlite
delta-<timestamp>-<uuid>.json
snapshot-<older-timestamp>-<uuid>.sqlite
```

`VACUUM INTO` creates a consistent standalone SQLite copy, including committed WAL data; the live database file is not naively copied. The uploaded bytes are downloaded and SHA-256 verified before the latest index changes. Credentials, Raycast extension preferences, local backup state, audio, and the separate lexicon are excluded. Dashboard practice/backup settings are library data and are included. Existing index updates require a strong ETag/conditional PUT. After a verified full snapshot and its new index are published successfully, obsolete increments referenced by the previous index are deleted. Failed deletions remain visible as cleanup pending and retry on subsequent interval checks, even without new library changes or another upload. Old full snapshots are retained for manual retention. Interrupted/conflicting uploads may leave unreferenced files; they are not blindly swept. Files are not client-side encrypted.

### New computer

1. Install the extension; configure the same WebDAV folder.
2. Choose **Restore Latest Backup from WebDAV**.
3. Review and confirm replacement; continue using the downloaded SQLite library data.
4. Enable optional automatic backup. Pronunciation requires no credentials.

Download verifies the full snapshot checksum, SQLite signature/integrity/schema and data structure, then downloads and validates every increment checksum, revision continuity and restored library before offering restore. Restoration transactionally replaces library tables instead of overwriting an open WAL database; current local data gets an automatic safety copy first. This is backup/restore, not multi-device merge. Unknown or changed remote backups cannot be overwritten blindly.

Legacy JSON remote backups are still readable; the next backup writes SQLite. Optional Export Portable Backup now exports a standalone `.sqlite` file, and Restore from Backup File accepts SQLite or legacy JSON. Download/restore limit: 128 MB. The implementation loads the personal library/review history in memory, not designed for unlimited multi-million-event archives.

## Reset test data

Open **Vocabulary Dashboard**, then its Action Panel → **Reset Entire Library** → **Continue to Final Confirmation** → **Delete Everything**. Cancelling the confirmation leaves the library unchanged. This clears all local words (including archived words), senses, notes, examples, groups, practice inclusion, scheduling cards, and review history. An automatic safety copy is created first. Preferences, audio cache, safety copies, and remote WebDAV backups are intentionally preserved. Reset itself does not trigger an automatic remote backup; subsequent normal edits may do so if enabled.

## License and tests

Code: MIT. Bundled noun data: LeXiK derived noun extract, separately CC BY-SA 4.0; see `assets/noun-lexicon-LICENSE.txt`. Uses macOS `/usr/bin/sqlite3` and `/usr/bin/afplay`, no native Node database addon.

```sh
npm test
npm run typecheck
npm run build
npm audit
```

Tests use temporary databases, mock speech responses, and a localhost binary WebDAV server, not personal credentials or real remote data. Real Raycast UI rendering, anonymous Frdic playback, installed dictionary opening, and the actual WebDAV service still need acceptance testing.
