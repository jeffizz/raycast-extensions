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

## Collections

Collections are named word lists, separate from Confusion Groups. A word may belong to multiple collections without copying vocabulary or creating new FSRS cards. Rename or delete them through **Browse / Practice → Actions → Manage Collections**. Renaming preserves the collection ID and membership; deletion removes only the collection.

In Import Preview, use the **Import Collection** dropdown to select a collection or choose **Choose or Create Collection…**. The destination is saved with the import-review draft. Successful import adds every imported word head, including exact duplicates, Keep Existing and merged rows. Collection membership and imported changes commit together; conflicts must still be resolved first. Creating a collection explicitly saves an empty collection even if import is later cancelled.

Browse supports **Filters → Collection** and **Actions → Collection**. Existing sorting, both layouts, searching, and Copy Spelling operate within the selected collection. Add/remove the current word or the deduplicated selection using collection Actions. These do not change global practice inclusion or familiarity. Processing progress is separately scoped to each collection; switching collections pauses processing.

**Practice → Actions → Practice Source** opens combined Browse-style filters: Collections (multiple selections match any), Part of Speech and Familiarity (All / No Status / Fuzzy / Know). All conditions intersect and are saved independently per mode in library settings and backups. The old Fuzzy Only / Know Only choices are read compatibly. Collection selection is now inside Practice Source rather than a separate Action. Missing/deleted collections match no words until another collection is chosen. Browse and Practice share the same word-level POS/familiarity predicate, including legacy Unknown as Fuzzy.

Due dates, shared per-mode daily limits and global exclusions still apply; archived or practice-excluded words cannot be enabled by source filters. New sessions use the current filters; Resume retains its captured queue and order. Resumable sessions are scoped by collection and skip removed members on reopening. Browse Copy Spelling uses its Browse results instead of saved Practice Source filters. Collections and membership are included in full SQLite backups and logical increments. No database schema migration is needed.

## Browsing

The dropdown selects **Recently Used** (default), **Import Order**, **Import Order (Reverse)**, **A → Z**, or **Random**. Random order remains stable until Shuffle Again. Recently Used considers edits, review answers, and viewing a word for approximately half a second. Viewing is persisted without making the list jump under the cursor; only reopening the command applies a new activity order. Edits and refreshes update content without moving existing words; newly imported words appear after the captured order.

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
| ⇧⌘T | Remove Selection from Practice |
| ⇧⌘C | Clear Selection |
| Return | Speak without changing selection |
| ⌘G | Add to a confusion group |
| ⇧⌘G | Add selected words to a group |
| ⌘1 / ⌘2 | Mark Fuzzy / Know (top-level actions) |
| ⌘0 | Clear familiarity |
| ⌘F | Filters |
| ⌘R | Refresh |

Batch selection uses check icons within the current Browse session. In **Actions → Selection**, choose **Set Range Start** on the first word, then **Select Range to Here** on the last word. This replaces the selection with the inclusive range in the current sorted and filtered results, in either direction, including words beyond the rendered page. Multiple sense rows select their shared word only once. If sorting or result membership changes, set the start again; stale ranges are rejected rather than silently selecting different words. Clear Selection also clears the range start. Selection itself does not edit vocabulary.

Selected words support collection membership, practice exclusion, archive/restore, confusion groups and **Mark Selection Fuzzy / Mark Selection Know / Clear Selection Familiarity**. Bulk familiarity updates are transactional, do not change FSRS or practice flags, and clear the selection after success. Existing single-word familiarity shortcuts continue to act on the current word.

## Performance and Unicode fixes

The old nested SQLite JSON-aggregation load took about 33 seconds on the actual 1,366-word library; plain-row transactional loading now measured about 43 ms (data loading only, not an end-to-end UI benchmark). Browse initially renders 80 rows and only the selected word gets a detail/action tree. Normal word edits use a targeted row transaction, rather than generating writes for the entire library. Browse currently loads review history to compute the recent-error window; the database benchmark above measures the lighter history-free loading path, not the current full Browse command.

SQLite stdout is decoded after concatenating binary chunks, fixing split UTF-8 sequences. Previously persisted replacement characters cannot be reversed without original text. Reimport original rows to repair uniquely matched damaged translation/IPA fields while retaining word/sense IDs, notes, and review history. Import preview shows a repaired count. Never reset the library to repair two fields.

## Import

Large previews load vocabulary without review history, clone only touched words, memoize calculations, and render only the selected conflict detail. Conflict and word pages contain at most 50 items each. Resolving a conflict saves the decision locally before advancing to the next unresolved row (across pages); after the last one, selection moves to the summary. Repeated decisions can reveal new conflicts in later rows; all must still be resolved before import.

The latest review draft (input rows, mapping and decisions) is saved in local SQLite metadata, not WebDAV backups. Reopen Import Vocabulary and choose **Resume Import Review** after exiting or a command crash. Starting a different preview replaces this single draft; a changed library can invalidate old decisions and require review again. Successful import clears the draft. This cannot recover choices lost before draft saving was introduced.

Conflict shortcuts: **⌘1 Keep Existing**, **⌘2 Update Existing**, **⌘3 Add as New Sense**, **⌘4 Merge Fields**. When several existing senses match, Update asks for a target and Merge provides a target picker; neither silently picks one for saving.

**Merge Fields** offers Existing, Incoming, and (for Chinese/English) **Combine Both: Existing First / Incoming First**, with live result previews. Combined translations are separated by a semicolon and space (`; `); empty or identical complete values are not repeated. Existing values are the defaults; explicitly selecting an empty Incoming field clears that field. This preserves one sense and its ID/learning references, rather than merging two already-stored senses.

Import Preview flags likely duplicates when the same spelling/POS shares a translation after punctuation, spacing and usage-marker normalization. Each flagged row requires an explicit **Keep Existing**, **Update Existing Sense**, or **Add as New Sense** decision. Incoming and existing fields are shown together; multiple candidates can be targeted individually. Keep is the safe first action but is not silently accepted. Unresolved rows block confirmation. Updates retain IDs and learning references and replace only non-empty imported lexical fields. Clearly different meanings remain separate, and exact duplicates are skipped. Decisions are revalidated against current data at commit time; changed conflicts require reopening the preview.

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

From Similar Words use **Link Any Word Manually** even when there are no suggestions, or use ⌘G in Browse. Group members are freely selectable from the entire library. Names automatically use member spellings (e.g. demain · matin · main); names can be customized. **Browse Group Members** and related-group details open the same full-width list by default, one sense per row. Return speaks the selected word without advancing. Show/Hide English Meanings is remembered locally and respects Translation Display (English Only hides the toggle). Move Word Up/Down moves all senses together; Sort A–Z and Use Library Order save the resulting member order in the group's existing wordIds array. Saved ordering is per group, survives reopening and full/incremental backups, and never reorders the library. Titles matching the current comma-space or legacy middle-dot member spelling sequence are regenerated in the saved order using comma-space; custom titles remain unchanged. Title and order updates commit together without changing notes. These are explicit reorder operations, not continuously reapplied sort modes. View Comparison Table opens a generated comparison in saved order; View Group Notes opens only the group's Markdown notes. The list and comparison table do not display group notes. Ordering uses a guarded group-row transaction without loading review history.

## Pronunciation and annotation cleanup

Stored spelling is unchanged. Speech and spelling practice automatically remove parenthetical/bracket annotations and everything after the first comma, including full-width Chinese punctuation:

* reposer(se) → reposer
* curieux,se → curieux
* sculpteur(trice) → sculpteur
* ancien(ne) → ancien

No manual pronunciation form is required. An optional override remains for unusual cases.

Nouns are spoken once alone, then with **un/une** (or des for plural forms); le/la/les phrases are not spoken. Unknown or ambiguous gender is not guessed. The bundled LeXiK noun extract can fill unambiguous gender/onset data but does not overwrite user/import gender or provide translations. Generated indefinite phrases are mnemonic aids; mass nouns or special usages can use a phrase override.

Word and article phrases are requested together, not downloaded separately. Frdic separates segments with sentence punctuation plus Tab, following the french-pronounce conjugation formatter's boundary technique. Eleven v3/v4/v4 Turbo use sentence boundaries plus [short pause], without extra paragraph breaks; known legacy v2 models use a 0.8-second SSML break. Unknown model IDs use punctuation and paragraph boundaries without assumed tag support. Single-segment requests remain unchanged. Only segment boundaries are separated: liaison inside un ami remains normal. Pauses generated by TTS are not a guaranteed acoustic duration or isolation; test the chosen voice/model. Combined audio gets a separate cache identity, so old individual clips are not reused as combined speech.

ElevenLabs pause references: [official pause/SSML compatibility](https://elevenlabs.io/docs/help-center/technical/do-pauses-and-ssml-phoneme-tags-work-with-the-api), [official audio-tag pause guide](https://elevenlabs.io/blog/how-to-add-pauses-in-ai-voiceover).

### Pronunciation providers

* Frdic uses anonymous `/api/v2/speech/speakweb` requests, with French language and Base64-encoded text using the service's `QYN` text prefix (not an account token).
* Frdic requires no account token, speech authorization mode, voice, or speed setting. ElevenLabs has its own keys and synthesis preferences.
* HTTPS audio redirects are handled with an upper bound; insecure redirects are rejected. The Frdic referer is not forwarded across origins.
* Downloads have a 20 MB limit and audio validation. HTTP/network/non-audio errors never include response bodies.
* The local cache is keyed by anonymous endpoint version and text. Dashboard → Clear Audio Cache removes it.

All pronunciation uses weighted random Frdic / ElevenLabs selection, before cache lookup. **Frdic Probability (%)** is 0–100 (default 100 for backward compatibility); ElevenLabs gets the remainder. The ratio is probabilistic per pronunciation sequence, not an exact quota. A word and its article phrases use one provider/voice and one combined synthesis payload (key retries may still issue further attempts). Random mode never falls back across providers.

Use **Vocabulary Dashboard → Pronunciation → Manage ElevenLabs Keys** to add authorized keys in this extension's encrypted Raycast LocalStorage. Keys and local usage are independent of french-pronounce and excluded from SQLite/WebDAV exports. Active keys are selected by weight; authentication errors and exhausted credits mark keys Invalid until manually reactivated. Other failures are recorded; another eligible key may be tried once, without switching providers. Cache hits do not consume API requests.

Configure French voice IDs, model and synthesis parameters in extension preferences. Voice IDs are selected randomly with separate caches; effective request settings/model also separate cache entries. The existing Frdic cache remains usable. Clear Audio Cache clears both providers. ElevenLabs requests send pronunciation text and a key only to api.elevenlabs.io, reject redirects, time out after 25 seconds and validate bounded MP3 responses. API requests can consume credits. Manual and automatic practice speech share this route. Real playback and account/model/voice compatibility need acceptance testing.

## Practice

Regular practice Actions include **Add to Confusion Group**. Search the full library by word or meaning, independently of Practice Source, and select one or more words with Return. **Choose Group** opens a searchable group list. **Create New Group** displays the selected words joined with comma-space. Choose an existing group to merge directly; its title is regenerated from all merged members joined with comma-space. Member IDs and displayed words are deduplicated, and existing group notes and identity are preserved. The current question is always included; memberships are deduplicated. Archived words are hidden by default and can be included from Actions. Saving returns to the mounted practice session without changing its input, reveal state, queue, familiarity, eligibility or FSRS. Group changes use normal SQLite backup handling. The search renders up to 80 matching words; refine the query to find more specific matches.

Recall Meaning provides **Enable / Disable Update Familiarity from Rating** in session Actions. This local preference persists and defaults to Off. When enabled, Again/Hard marks Fuzzy and resets the success streak. Unmarked words become Know on their first Good/Easy; Fuzzy (including legacy Unknown) needs two consecutive Good/Easy ratings to become Know. Know remains Know on success. A single optional word JSON field stores only 0/1 (absence means 0), persists across sessions, and travels through full SQLite and incremental backups without a schema migration. Manual familiarity actions reset it; normal meaning ratings while the link is off also reset it. Other modes and reinforcement do not count. Existing backups remain readable and do not need replacement. The global word familiarity and normal FSRS review commit in the same SQLite transaction, with immediate icon updates across sense rows. This never adds an extra review, changes another mode's FSRS, or retroactively changes earlier answers. Reinforcement choices and manual familiarity edits do not trigger this link. The active queue stays fixed; new sessions apply updated familiarity filters.

All four regular practice modes offer **Manage Current Word** actions: Mark Fuzzy, Mark Know, Clear Familiarity, Archive Word and Remove from Practice. Copy Spelling retains ⌘1 / ⌘2 / ⌘0; recall modes use ⌘⇧1 / ⌘⇧2 / ⌘⇧0 so rating and gender shortcuts remain unchanged. Archive uses ⌘⇧A and exclusion uses ⌘T. These edit the word globally without adding FSRS reviews. Familiarity edits keep the current question and queue order; archive/exclusion advances without grading and skips any later senses of that word. Both layouts immediately refresh existing familiarity icons (no familiarity symbol for Unmarked), and archived rows show the archive icon. Reinforcement questions keep their separate answer controls.

Recall Meaning offers **Mix in Multiple Choice** (off by default, remembered). Both layouts support ungraded reinforcement; normal optional spelling and FSRS ratings remain separate. Again queues a word; five distinct other normal word completions unlock a choice question. Wrong choices reset that spacing, correct choices finish the task. At least three normal cards separate choice questions, with at most two attempts per word per saved session. Unfinished tasks persist locally across sessions and library resets invalidate them. Disabling the toggle pauses insertion without deleting tasks. No extra words are added to fill spacing; completion shows pending tasks.

Choice questions suspend spelling input and use ⌘1–4 for A–D. Feedback identifies the correct answer and each option's French word; Return continues without recording an FSRS review or daily usage. Reinforcement always uses the same full-width list, regardless of normal practice layout. Initial focus is on the question header, not an answer. Return on the question header shows instructions. After deliberately selecting an option, Return submits that option; ⌘1–4 and Actions also submit explicitly. Mouse clicks and arrow keys only move selection and never submit an answer. Option rows appear only after the question header is initially selected, preventing automatic answer submission during mounting. After feedback, Continue returns to the original practice layout. Press Return once more on Return to Current Question to select and scroll to the pending normal question; this navigation does not reveal, grade or advance the card. Automatic restoration is intentionally disabled because inserting preceding rows can leave native scroll position behind selection. Distractors prioritize confusion groups, then shared collections, then the library, requiring matching POS and rejecting overlapping translation fragments. These are conservative lexical heuristics, not semantic guarantees; fewer than three acceptable distractors postpones the question. Current Practice Source and global eligibility apply to reinforcement targets. Tasks and answers are local metadata, not WebDAV learning history.

Copy Spelling, Recall Meaning and Recall Spelling provide **Use List Layout / Use Detail Layout**, remembered independently per mode. List layout uses one sense per row without duplicating practice questions. Recall Meaning hides translations until Reveal Meaning, then offers Again / Hard / Good / Easy (⌘1–4); grading advances to the next question. Future meanings stay hidden. Recall Spelling displays meanings without showing the French answer until checked; incorrect answers temporarily open the detail comparison and retain the two-Return workflow.

With Auto Pronunciation enabled, Recall Meaning supports **On Word Entry / After Reveal**, while spelling modes support **On Word Entry / After Submit**. Both timings prepare current-word audio on entry, checking the selected provider's local cache before requesting audio. Delayed playback reuses the prepared request and provider/voice selection. Meaning reveal playback does not block grading; advancing cancels obsolete loading/playback. Layout, pronunciation and timing toggles do not create review records; FSRS is updated only by grading or checking an answer.


Copy Spelling starts directly when no resumable progress exists. Only unfinished sessions show the chooser with **Resume Session**; **Start New Session** uses the current order and filters and asks before replacing progress. Progress is local-only, stores compact word references, and is saved after checked answers and explicit skips. Old full-word session records are read compatibly. The practice list renders at most 80 nearby rows, not the entire queue. Know words come last while preserving relative order within both groups. Unsubmitted partial input is not saved.

Recall practice uses the original scheduled order. Browse → **Copy Spelling** starts Copy Spelling from all current search/filter results (not just the rendered page), preserving their exact displayed order, including Random and processing-session remaining words. The queue is fixed when started and does not mark processing items done. Archived/globally excluded words and unusable spellings are skipped. Copy pronunciation settings still apply.

All non-archived words are included by default. Browse → Remove from Practice (⌘T) or Remove Selection from Practice explicitly excludes words; Add to Practice restores inclusion. No vocabulary is copied: `practice` is the only inclusion flag and is mirrored in the SQLite column and word JSON. Loading never migrates false to true. Archiving temporarily excludes a word without changing its practice flag.

Typed answers preserve accents and capitalization. Copy Spelling and Recall Spelling submit and advance immediately when input fully matches the expected spelling (Unicode NFC-equivalent input is accepted). Partial input never counts as an error. Press Check Spelling/Return to check an incorrect answer: it is saved immediately, and the page remains for comparison; Continue advances without saving it twice. Feedback is a single-column table with two content rows: correct spelling first, then the input, without per-character highlighting.

* Copy Spelling: vocabulary and full details are visible; copying is tracked separately and does not change FSRS.
* Recall Meaning: left list shows the actual vocabulary. Reveal, then rate Again/Hard/Good/Easy using ⌘1–4.
* Recall Spelling: POS/translations are visible, while the French answer and potentially revealing notes/examples/article phrases stay hidden until Check Spelling. Checking then shows the word, comparison, and full details.
* Noun Gender: ⌘1 = masculine/un, ⌘2 = feminine/une. Ambiguous analyses are excluded.
* ⌘B manually speaks in every mode, including Recall Spelling before checking.
* Each mode and active practice session provides **Enable Auto Pronunciation / Disable Auto Pronunciation**. Changes are saved immediately per mode in SQLite and survive reopening, including Browse Copy Spelling. Default is Off. Noun Gender omits revealing articles before checking. Dashboard no longer has Practice Settings.
* Practice Source uses Collections, Part of Speech and Familiarity filters. Per-mode Selected Words lists and Browse Add Selection to Practice have been retired. Legacy selected-source settings behave as Default Library while retaining source filters, pronunciation and daily limits; old backup fields remain readable but no longer restrict practice. Existing saved sessions keep their captured queues. Global practice inclusion, vocabulary, Collections and FSRS history are unchanged.
* **⌘⇧E** ends the session, waits for any in-flight answer write, and returns to Practice, including when another queue row is selected. ⌘Return is reserved by Raycast for the secondary action.

Each checked spelling/gender answer and each graded meaning answer is committed immediately to local SQLite, independently of completing the queue. Leaving early does not discard these records, including an error still displayed for comparison. Unchecked partial input is not an answer and is not saved. Copy attempts do not change FSRS; correct recall spelling uses Good, incorrect recall spelling uses Again. A new session builds a new due/new queue from persisted scheduling rather than resuming an exact queue cursor. Answers, End Session and completion check WebDAV backup intervals when enabled; closing the command directly preserves committed local records but does not guarantee remote backup. Short-term due cards are included when starting the next finite session.

### Daily recall limits

Recall Meaning, Recall Spelling and Noun Gender each provide **Actions → Daily Limits**. Defaults: 10 new cards per local calendar day, unlimited review cards. Blank review limit means unlimited; zero pauses a category. Settings persist in library backups. Counts use distinct submitted cards across all sources, not reserved queue slots; repeated reviews do not use additional slots, and new cards first studied today remain in today's new category. Due reviews precede new cards; selected ordering applies within each category. The mode details show today's usage and due cards in the current source.

Resumed queues preserve their order and check today's allowance on submission. If the allowance is exhausted, progress remains saved; continue tomorrow or increase the limit. **All Included Words (Extra Practice)** bypasses due-date and daily limits for a new session, but still records answers and updates FSRS; its activity also counts toward today's usage. Resuming always checks daily limits. Copy Spelling is unaffected. Daily limits never change FSRS timestamps by themselves.

## SQLite and WebDAV backup

All reads/edits are local in `environment.supportPath/vocabulary.sqlite`. No per-word WebDAV query. **No manual Local Snapshot task is required.** Safety copies are automatically created before imports/restores/resets; these are internal recovery protection, not the main backup workflow.

1. Create an existing dedicated HTTPS WebDAV folder.
2. Configure its URL, username, and app password in preferences.
3. Dashboard → **Backup & Restore → Manual Full Backup**.
4. Optionally enable Automatic WebDAV Backup. Dashboard → Backup & Restore → Backup Settings configures intervals (default: 5 minutes incremental, 24 hours full). Checks happen on command opening, word browsing, edits, and practice answers. No background timer runs while the command is closed. Checks are throttled to once per 15 seconds; Dashboard indicates pending changes.

WebDAV uses **SQLite full snapshots plus JSON logical increments**. A local hash baseline identifies changed word/group/card/review rows; increments contain those rows, collection ID order (also representing deletions), and library settings. This is not a byte-level SQLite/WAL diff: generating an increment reads the local library, and its ID lists grow with library/history size. The normal path only transfers the new increment and index, not the complete SQLite file. A missing baseline, different library, increment over 8 MB, or 128 increments causes a full snapshot. Overdue full snapshots run even without new edits; manual full backup always creates a new snapshot.

Remote:

```text
latest.json
snapshot-<timestamp>-<uuid>.sqlite
delta-<timestamp>-<uuid>.json
snapshot-<older-timestamp>-<uuid>.sqlite
```

`VACUUM INTO` creates a consistent standalone SQLite copy, including committed WAL data; the live database file is not naively copied. The uploaded bytes are downloaded and SHA-256 verified before the latest index changes. Credentials, Raycast extension preferences, local backup state, audio, and the separate lexicon are excluded. Dashboard practice/backup settings are library data and are included. Existing index updates require a strong ETag/conditional PUT. After a verified full snapshot and its new index are published successfully, obsolete increments referenced by the previous index are deleted. Failed deletions remain visible as cleanup pending and retry on subsequent interval checks, even without new library changes or another upload. Indexed full snapshots are pruned to the configured count (default 5, including the active snapshot; range 1–100). Older untracked snapshots are not swept. Interrupted/conflicting uploads may leave unreferenced files; they are not blindly swept. Files are not client-side encrypted.

### New computer

1. Install the extension; configure the same WebDAV folder.
2. Choose **Restore from WebDAV**.
3. Review and confirm replacement; continue using the downloaded SQLite library data.
4. Enable optional automatic backup. Frdic requires no credentials; configure ElevenLabs keys separately if used.

Download verifies the full snapshot checksum, SQLite signature/integrity/schema and data structure, then downloads and validates every increment checksum, revision continuity and restored library before offering restore. Restoration transactionally replaces library tables instead of overwriting an open WAL database; current local data gets an automatic safety copy first. This is backup/restore, not multi-device merge. Unknown or changed remote backups cannot be overwritten blindly.

Legacy JSON remote backups are still readable; the next backup writes SQLite. Backup & Restore → Export Backup File now exports a standalone `.sqlite` file, and Restore from Backup File accepts SQLite or legacy JSON. Download/restore limit: 128 MB. The implementation loads the personal library/review history in memory, not designed for unlimited multi-million-event archives.

## Reset test data

Open **Vocabulary Dashboard**, then Library Overview → Action Panel → **Reset Entire Library** → **Continue to Final Confirmation** → **Delete Everything**. Cancelling the confirmation leaves the library unchanged. This clears all local words (including archived words), senses, notes, examples, groups, practice inclusion, scheduling cards, and review history. An automatic safety copy is created first. Preferences, audio cache, safety copies, and remote WebDAV backups are intentionally preserved. Dashboard reset first requires a verified WebDAV full backup plus a permanent `permanent-backup-<timestamp>-<uuid>-<sha256>.sqlite` copy. Failure cancels reset. A revision guard rejects reset if local data changed during upload. The next backup after reset uses a full snapshot. Manage permanent archives in Backup & Restore → Browse Remote Files: download verifies checksum/integrity; deletion requires confirmation. Archives are excluded from automatic retention. Restore downloaded archives via Restore from Backup File; restoration replaces the local library, not merges it.

## License and tests

Code: MIT. Bundled noun data: LeXiK derived noun extract, separately CC BY-SA 4.0; see `assets/noun-lexicon-LICENSE.txt`. Uses macOS `/usr/bin/sqlite3` and `/usr/bin/afplay`, no native Node database addon.

```sh
npm test
npm run typecheck
npm run build
npm audit
```

Tests use temporary databases, mock speech responses, and a localhost binary WebDAV server, not personal credentials or real remote data. Real Raycast UI rendering, anonymous Frdic playback, installed dictionary opening, and the actual WebDAV service still need acceptance testing.

## LeXiK usage and backup interpretation

`src/lexicon.ts` queries the bundled offline `assets/noun-lexicon.sqlite` by normalized noun form. Import confirmation and the word action **Enrich Noun Data from Lexik** call it. It fills unknown gender only when the matching forms agree on one masculine/feminine value, and fills unknown onset only when the gender-filtered candidates agree. Existing values are preserved. Parenthesized spellings are skipped. It does not supply translations, IPA, speech audio, verb inflections, or similarity scores. Gender/onset feed noun practice and article/mnemonic generation.

Always interpret the remote folder through `latest.json`, not file counts. It names one active full snapshot and its ordered delta chain; historical snapshots and orphaned or cleanup-pending deltas may coexist. An empty active chain means the active SQLite alone represents the latest **backed-up** revision, not necessarily the latest local edits. Restore downloads and verifies the named snapshot and deltas, applies logical deltas in memory, previews the reconstructed library, then transactionally replaces local tables after a safety copy.

### Operational limitations

* This is backup/restore, not multi-device synchronization. Remote changes require inspection/restoration rather than merging.
* Historical full snapshots tracked by the index are pruned; older untracked or orphaned files remain untouched and can still consume storage.
* Library/review history is loaded in memory; delta generation includes collection ID lists, so increments are not constant-size.
* Automatic backup runs on extension activity, not while Raycast is closed. Live Raycast rendering, actual pronunciation playback and the real WebDAV endpoint require manual acceptance testing.

## Processing sessions

In Browse, choose **Start Processing Session** directly. The session captures all words in the active/archive view, regardless of current filters. Change sorting, search and filters at any time while processing; these operate on the remaining words, never restoring completed items. New imports are not added until a new session. **Mark as Done** (⌘⇧D) removes the current word from this queue only. It does not change vocabulary, familiarity, practice inclusion, or review history.

**Pause Processing Session** returns to ordinary browsing. Reopen Browse and choose **Resume Processing Session** to continue. Progress is saved after every completed item in local SQLite metadata, separate from the library and WebDAV backups. Active and archived browsing have separate sessions, scoped to the library ID. Deleted words and words no longer in the relevant archive view are not displayed. **Discard Processing Session** removes only progress; starting a new session asks before replacing saved progress. Sorting, search and filtering remain available while processing. A filtered empty view does not necessarily mean the session is complete. Existing saved sessions retain their original membership.

Start or resume processing with **⌘⇧P**. Mark the current word done with **⌘⇧D**.

## Backup actions and status

Return refreshes Library Overview and opens Browse Remote Files in Backup & Restore. Restore from WebDAV and Manual Full Backup have no dedicated shortcuts and are not primary actions. Manual Full Backup uses the normal full-snapshot pipeline and forces a new retained snapshot, even when unchanged.

**Check Remote Backup Health** downloads and verifies the active snapshot and increment chain without changing local data. Restore performs these checks before preview; reset verifies its newly uploaded standalone permanent backup before clearing data, rather than auditing every historical file. Existing `archive-before-reset-` files remain supported; new permanent backups use `permanent-backup-`.

**Unbacked Changes** means a revision mismatch, not an active upload. Browsing activity can change the revision. **No Backup Recorded** means there is no recorded backup for the configured destination; it is not a live assertion that the remote folder is empty.

## Remote backup inventory

Dashboard → **Backup & Restore** → **Browse Remote Files** reads the live index and directory via PROPFIND. It shows file names, sizes and modification times, classifying active snapshots/increments, retained snapshots and untracked files. Refresh with ⌘R. Listing errors are shown separately from readable index metadata. This is read-only metadata inspection, not checksum verification.

## Retention and practice controls

Dashboard → Backup & Restore → Backup Settings → **Full Snapshots to Keep** sets how many indexed full SQLite snapshots to keep (default 5, including current; set 3 for the latest three). Retention runs after a new backup is verified and its index published. Failed deletions remain pending and retry. Snapshot history is stored in the remote index so another restored computer can continue retention. Files created before history tracking, and unpublished orphan uploads, are never blindly deleted.

JSON increments referenced by the previous active chain are deleted only after successful full publication; active increments and `latest.json` are never pruned. Historical full SQLite files are standalone historical states, not copies of the latest incremental state.
