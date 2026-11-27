# French Vocabulary: Agent Guide

Applies to this extension directory and its descendants, not sibling extensions.
This is a development guide, not a replacement for the current user request or a complete specification.
Read the relevant code and tests before changing an existing feature. Ask about material ambiguities;
do not reconstruct missing requirements from assumptions about previous conversations.

## Working agreement

- Keep code comments, documentation and UI strings in English. Preserve French and Chinese vocabulary data.
  Answer the user in their chosen language.
- At the start of every user turn for this project, check `git status --short`. If there are uncommitted
  changes (staged, unstaged, or untracked), ask whether to commit the existing changes first and wait
  for the user's answer before proceeding with the new request. When Raycast offers a structured prompt,
  use clickable choices (`Commit first` or `Continue without committing`) instead of requiring a typed reply.
  Fall back to a chat question if unavailable. Skip the question if the user already explicitly chose.
  Do not commit automatically.
- Inspect the relevant Git diff before editing. Preserve unrelated and user-authored changes.
- Do not commit, push or publish without an explicit request. Use focused semantic commit messages.
  Normally let the user verify behaviour before committing.
- Finish requested implementation and fix actionable build/lint/test failures.
  Report checks actually run; distinguish unit tests from native Raycast acceptance testing.
- Do not run `ray develop` in the normal workflow. Use a temporary background process only for necessary
  runtime debugging and stop it afterward.
- Avoid broad refactors, dependency additions or schema changes for small UI tasks.
- When a change introduces or supersedes a stable rule, update this guide and relevant documentation/tests.
  Do not accumulate transcripts, temporary status, commit hashes or exhaustive feature history here.

## Project map

Paths below are relative to this extension, within a multi-extension Git repository.

| Area | Start here |
| --- | --- |
| Manifest / validation scripts | `package.json` |
| Browse and archive | `src/browse.tsx`, `src/archive.tsx` |
| Practice and saved-session lifecycle | `src/practice.tsx`, `src/core/copy-session.ts` |
| Data model / validation / SQLite | `src/core/model.ts`, `src/core/sqlite.ts` |
| FSRS, daily limits, reinforcement | `src/core/learning.ts`, `daily-limits.ts`, `reinforcement.ts` |
| Collections and membership editing | `src/core/collections.ts`, `collection-membership.ts`, matching components |
| Confusion groups and ordering | `src/components/related-confusion-groups.tsx`, `group-details.tsx`, `src/core/group-order.ts` |
| Import and resumable conflict review | `src/import-vocabulary.tsx`, `src/core/importer.ts` |
| AI prompts / transport / review / save | `src/ai/core.ts`, `client.ts`, `workflow.tsx`, `save.ts` |
| Word Family | `src/ai/family.ts`, `family-view.tsx` |
| Combined status indicator / personalization | `src/components/status.ts`, `content-status.ts`, `indicator-colors.tsx`, `src/core/indicator-colors.ts` |
| Pronunciation | `src/speech.ts`, `src/tts/`, `src/core/frdic.ts` |
| Backups / logical increments | `src/core/backup.ts`, `delta.ts`, `src/dashboard.tsx` |
| Runtime loading / preferences | `src/runtime.ts` |
| Regression tests | `tests/*.test.ts` |

README contains useful feature details, but some older descriptions/shortcuts are historical.
Check implementation and tests rather than restoring an outdated README behaviour.

## Data and safety boundaries

- Never reset, normalize, merge, delete or restore the real vocabulary library merely to debug code.
  Use temporary Store instances and fixtures in tests. Real data operations require a separate explicit request.
- Preserve word/sense IDs, manual content, familiarity, FSRS state, reviews and unrelated relationships
  unless the requested operation explicitly changes them.
- Use guarded Store operations and atomic transactions; do not directly rewrite the live SQLite file.
  Keep optional fields compatible with existing backups. Test SQLite and delta roundtrips for persistence changes.
- Keys/credentials stay out of vocabulary, backups, logs and error output.
  Do not read CLI credential files or silently switch to a paid provider.
- Do not perform actual WebDAV uploads, deletions, resets or restores as part of automated validation.
  Preserve existing safety backups and remote files.
- Vocabulary deletion/Danger Zone and headword normalization tools were deliberately removed after a one-off cleanup.
  Do not reintroduce them or reverse the user's completed deletion/reimport results unless requested.
  Existing archive/restore and unrelated collection/group management remain separate capabilities.

## Memory and performance

Raycast's approximately 100 MB extension heap limit is a practical constraint.

- Do not load or clone the complete learning history for settings/content tasks.
  Prefer `load(false)`, targeted row operations and `updateSettings` where appropriate.
- Practice grading updates one word, one review and (except Copy) one card atomically.
  Compute daily eligibility without loading all review history into Node.
- Reuse existing vocabulary references. Keep rendered rows and caches bounded; avoid global growing maps.
- Word Family matches a batch of candidates in one vocabulary scan, retaining only requested hits.
  Do not replace this with repeated full scans or a persistent whole-library alias index.
- Collection-selection mode checks are memoized against selection and collection changes.
  No extra database/history query is needed per row or selection.
- Heap-limited tests are useful but do not prove a long-running native Raycast session cannot exceed the limit.

## Established interaction contracts

- Use public Raycast APIs and prefer appropriate `@raycast/utils` hooks/helpers over custom async state.
  Inspect installed types when unsure. Keep loading, error, cancellation and empty states useful.
- Familiarity and enrichment share ONE SVG accessory slot, always the rightmost accessory.
  Ratings, POS and archive badges precede it across Browse/archive, Practice layouts and group details.
  Ring colours are locally configurable; familiarity symbols stay inside the ring.
  Candidate statuses use compact icons/tooltips rather than long text squeezing list rows.
- Translation order/visibility is persistent per relevant surface; respect English Only.
  Do not break pronunciation, rating or navigation shortcuts while changing list layouts.
- Familiarity actions can mark Fuzzy or Know, but do not expose a clear-to-Unmarked action.
  Preserve Unmarked as a stored state and filter.
- Practice inclusion remains available separately from archiving; the single-word exclusion action has no shortcut.
  Do not restore the old practice-inclusion blue ring.
- Collections store member word IDs in library settings; words can belong to multiple collections without duplication.
  Browse scope is selected through Filters, not a redundant Collections scope Action.
  Full membership sets identical (including all unassigned): Edit Word Collections permits add/remove.
  Mixed membership sets: Add to Collections permits additions only; cancelling a pending addition must not remove
  an existing membership. Sharing just one collection is NOT identical membership.
  Changes are drafts until Save Changes; leaving without saving must not mutate data.
- Import preserves annotated spellings. Conflicts require explicit, resumable decisions saved before advancing.
  Do not silently strip arbitrary parentheses/commas or merge imported words/senses.
- Group order is stored in existing wordIds. Generated titles follow order; custom titles and notes are preserved.
  Related-group lookup is based on the current word, not the intersection with selected additions.

## Learning invariants

- Recall dimensions have independent schedules. Copy Spelling/reinforcement must not create normal FSRS ratings.
- Preserve current session order, answer/reveal state and progress during unrelated content/relationship edits.
  Archive/global practice exclusions apply independently of source filters.
- Reinforcement is opt-in, delayed, ungraded and persisted; selection movement alone must never submit an answer.
  Return on the multiple-choice question row speaks the prompt before answering and resumes practice after feedback.
- Recall Meaning familiarity linkage is opt-in, default Off:
  first success on Unmarked gives Know; failure gives Fuzzy; Fuzzy needs two consecutive Good/Easy successes.
  Preserve the existing small streak/reset semantics and do not double-count saved answers.
- New sessions select the first question; resumed sessions use explicit Return to Current Question navigation.
  Do not reintroduce unreliable forced viewport restoration.
- Overview and daily statistics derive from stored records. Do not introduce separate counters that drift
  from authoritative data without an explicit design.

## AI and lexical boundaries

- Only send task-relevant current vocabulary/meanings, never the entire library, learning history or credentials.
  Generation and saving are distinct: validate, preview, select, then explicitly confirm saving.
  Confirmed AI comparisons replace group notes; they never append.
- Word Chat is stored separately by library and word ID. Keep the history boundary and request payload
  driven by the same bounded context selector. The local history-window preference limits complete turns sent,
  not stored history, and never bypasses the request byte budget. Do not cache chat answers in the generation cache.
- Word Chat uses independent per-word WebDAV backups with clear markers and guarded updates;
  restoring chats must not overwrite local conversations or modify vocabulary data.
- API model setup/refresh fetches a catalog and uses local assessment; it must not automatically pay for AI analysis.
- Codex runs independent, ephemeral, isolated tasks through the existing adapter with cancellation/time/output bounds.
  Preserve its tool/network/config restrictions. API retry is explicit and never a silent fallback.
- Word Family is inside AI Vocabulary, immediately before Chat About This Word. Show saved links and cached/generated candidates.
  Example, collocation and mnemonic review shows saved content separately from AI candidates.
  Word Family has its own 30-day / 300-entry disk cache. Examples and collocations share a separate
  30-day / 300-entry disk cache, generated from the word and selected sense without saved content.
  Compare those candidates locally against current entries; Senses and Mnemonic keep their existing policy.
- Existing Word Family headwords (including archived records) allow linking only to a compatible specific sense,
  not adding/replacing senses or linking a mismatched POS. Same-batch genuinely new heads can share multiple senses.
- Variant matching is conservative: recognize supported suffix annotations and explicit complete variants such as
  nouveau(nouvelle), but never strip arbitrary parentheses. Keep accents and pronominal distinctions.
  Word Family maps explicit suffix and reflexive labels to matching headwords but preserves construction
  annotations. AI sense matching may compare known constructions to plain lemmas within the current word.
  Match keys do not rewrite local spellings.
- Senses/collocations prioritize common, core, accurate content, not novelty relative to local data.
  Equivalent candidates may still be returned and explicitly used to update existing content; never auto-overwrite.
- Provenance is shown in Manage Senses, not ordinary word details.
  AI noun onset comes from the same response (unknown if uncertain); known onset is not overwritten.
- Structured collocations retain stable IDs and sense references, separate from Notes/legacy text.
  Pattern placeholders use qch/qn/inf; complete example sentences do not.
- Record reported usage, distinguish unknown from zero and exclude cache hits. Do not issue real paid AI/TTS
  requests just to prove a code change works unless explicitly requested.

## Validation and delivery

For code changes, run from this extension directory (install dependencies if needed):

```sh
npm run typecheck
npm run lint
npm test
npx ray build -e dist -o dist
git diff --check
```

Use the explicit build command above: the package build script alone does not specify the output directory.
Use `&&` between checks; a successful tail command does not mean tests passed.
Add behavioural tests for changed logic; source-inspection tests alone are insufficient for data changes.
For memory-sensitive matching/scheduling changes, consider the relevant tests with
`node --max-old-space-size=100 --import tsx --test tests/<relevant>.test.ts`.

When local runtime functionality changed, install the verified `dist` through the available native Raycast
developer tool, passing both build path and editable sourcePath. Do not publish automatically.
Documentation-only edits do not require rebuilding/reinstalling or making paid/network calls.
End with a concise summary, actual validation results, installation status and any native acceptance-test caveats.
