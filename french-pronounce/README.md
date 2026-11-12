# French Pronounce

Pronounce selected French and English text in Raycast with frdic and ElevenLabs. No command reads the clipboard. Existing optional Chinese translation and French conjugation formatting are retained.

## Setup / rename migration

The extension ID is now `french-pronounce` (previously `frdic-pronounce`). The source folder is also renamed to `french-pronounce`. Raycast may treat this as a new extension: re-enter preferences and reassign hotkeys. Disable/remove the old extension to avoid duplicate commands. No attempt is made to read or migrate another extension ID's encrypted storage.

```sh
cd /Users/codiy/Repos/raycast-extensions/french-pronounce
npm install
npm run build
npm run dev
```

Alternatively use Raycast's Import Extension command and choose this directory. The legacy shell script is retired and cannot issue requests.

1. Open **Manage ElevenLabs Keys**, press `⌘N`, and add a label and API key. Saving never calls ElevenLabs.
2. Voice IDs are optional: blank/missing French uses `FvmvwvObRqIHojkEGh5N`; English uses `bGnz83yTAb7caZSC7BBz`. These are extension defaults, not guaranteed universally accessible/free voices. Configure one or multiple IDs separately for French and English, separated by commas or pasted line breaks, for example `voiceID1, voiceID2`. One ID is used as-is. With the **Cache ElevenLabs audio separately by Voice ID** option off (default), multiple IDs share the same cache and one is randomly selected only on a cache miss. With the option on, one is randomly selected for every ElevenLabs playback, then that voice's cache is checked. Empty entries are ignored and duplicates removed. Use voices available to every account/key being rotated. **Frdic English Voice** only affects Frdic, never ElevenLabs.
3. Assign hotkeys to the two Selected Text commands and **Cycle Speech Strategy**. In Raycast select the command, open **Configure Command → Set Hotkey**, or use **Settings → Shortcuts**.
4. Accessibility access may be needed for selected text. No clipboard fallback is used when selection is unavailable.

## Commands

| Command | Behaviour |
| --- | --- |
| French Pronounce (Selected Text) | Validate selection, strip boundary parenthetical annotations, retain six/seven-cell conjugation formatting, pronounce in French |
| English Pronounce (Selected Text) | Validate selection and pronounce in English |
| Cycle Speech Strategy | Persistently cycle Default → frdic only → ElevenLabs only → Random → Default; HUD shows result; supports a global hotkey |
| Select Speech Strategy | View current strategy and select one directly |
| Manage ElevenLabs Keys | Add/edit credentials and labels, enable/disable/delete, reactivate, view usage/cooldown |
| Clear Pronunciation Audio Cache | Confirm, then permanently remove hashed Frdic and ElevenLabs audio files; report count and size |
| Toggle Translation | Existing optional Chinese translation switch |

Only two **pronunciation/input** commands remain; the other commands manage settings. Optional translation toast Copy actions still write a translation to the clipboard when explicitly clicked; they never read it.

## Provider strategies

* **Default:** fetch/play cached frdic audio first; if audio acquisition fails (HTTP, timeout, empty/non-MP3 response), try ElevenLabs.
* **frdic only:** never use ElevenLabs, including its cache. No ElevenLabs key, voice or model configuration is needed. The default strategy likewise works without ElevenLabs when Frdic succeeds; if Frdic fails, its fallback cannot succeed without an active key.
* **ElevenLabs only:** never use frdic, including its cache.
* **Random: Frdic / ElevenLabs:** independently choose one provider for each pronunciation. Configure **Random Strategy — Frdic Percentage** in extension preferences: a number from 0 to 100 (decimals allowed), default 50. ElevenLabs receives the remainder; e.g. 70 means 70% Frdic / 30% ElevenLabs. Blank means 50; 0 and 100 select only ElevenLabs and Frdic respectively. Invalid values are reported without a TTS request and do not affect other strategies. Randomness gives a probability per attempt, not a guaranteed ratio over a small number of runs.
* Random mode draws a provider **before cache lookup**, uses that provider's existing cache and keeps the other provider's cache intact. A cache hit does not make an API request or consume ElevenLabs credits. If the chosen provider fails or lacks credentials, random mode reports the error and **does not fall back to the other provider**. ElevenLabs Key rotation and cooldown still apply when ElevenLabs is chosen. The existing Default strategy retains Frdic → ElevenLabs fallback.
* A local `afplay`/output-device failure does not trigger fallback or disable a key. The associated cache entry is removed so the next run can download again.
* frdic requests time out after 12 seconds; each ElevenLabs attempt after 25 seconds. Requests never follow redirects.

## ElevenLabs keys and statistics

Keys are stored in Raycast's extension-local **encrypted LocalStorage**, not source files, preferences exports, audio cache names, or logs. Credentials are entered in password fields and never displayed. The secret is sent only as the `xi-api-key` header to the fixed ElevenLabs HTTPS endpoint. Raw server error bodies are not stored. Bounded JSON error fields (HTTP status, provider code/status/type, and redacted message) are retained for diagnosis; known credentials and submitted text are removed, with additional heuristic redaction. Do not treat heuristic redaction as a universal guarantee.

* Each request picks one active key at random, weighted by its **Weight** (set in Manage ElevenLabs Keys; default 1; e.g. 3 vs 1 gives about 75% / 25%). Disabled or Invalid keys are skipped. Each eligible key is attempted at most once per invocation.
* **Any failed request tries another key.** Only two kinds of failure mark a key **Invalid**: HTTP 401 (authentication) and exhausted credits (provider code `quota_exceeded` or `insufficient_credits`, on any status). Invalid keys have no timer and are skipped until you use **Reactivate Now**. All other failures (402 plan/voice restrictions, 400, 403, 429, 5xx, invalid audio, timeouts and network errors) are recorded in **Last API error** but leave the key Active.
* **Reactivate Now** clears the Invalid status, last error and current-cycle counters, and enables the key. Keys saved by the previous 7-day cooldown version that were blocked are migrated to Invalid and stay skipped until reactivated.
* Lifetime request count, submitted characters, successful characters and failure count remain after reactivation. Current-cycle characters/failures reset. Replacing the secret resets all statistics and identity for that entry. In-flight responses for the old identity are ignored.
* Submitted characters count attempted payloads, including failed attempts; successful characters count valid audio responses. They are **local Unicode code-point counts**, not official credits, remaining quota, or an account-wide usage meter. Retrying another key counts the text for that key too. Cached audio does not add usage.
* Deleting an entry removes its saved secret and statistics, but does not revoke the key remotely or cancel an already in-flight request.
* A short filesystem lock protects read-modify-write operations across commands. If settings are busy, retry; stale locks expire after one minute. Network calls never hold the lock.
* Use authorized accounts/keys and comply with provider quotas and terms. Multiple keys in the same account generally do not represent independent account quotas.

## Text checks and third-party data

Checks run locally **before either TTS or optional translation**:

* Normalize to NFC, trim, reject empty/no-word selections, hidden/control characters and unpaired surrogates.
* Maximum **175 Unicode code points** (including spaces/punctuation) for the original normalized selection and the actual formatted speech/translation payloads. Expanded conjugation templates can exceed the limit even if the original selection does not. Oversized input is rejected, not silently truncated.
* **Local Privacy Checks** is on by default: heuristic rejection of emails, URLs, credential-like strings, JWTs, long number sequences, common local paths and markup. It may produce false positives/negatives. Turning it off disables only these heuristics, not length/control checks.

These rules are **not a privacy guarantee**. Names, addresses, short passwords, confidential prose or unusual secret formats can pass. Do not select sensitive material. Default strategy can disclose the same text to both providers when frdic fails. Optional Google/DeepL translation sends the validated translation text independently; default Translation Engine is None, but existing configuration is preserved.

frdic uses an HTTPS GET query; Base64 is encoding, **not encryption**. ElevenLabs receives a POST JSON body and by default may retain requests/audio according to its policies. The `enable_logging=false` zero-retention feature is restricted to eligible enterprise accounts, so this extension does not pretend to provide it for ordinary accounts.

Audio is cached persistently, unencrypted, under `environment.supportPath/audio-cache`, with SHA-256 filenames and restrictive file permissions. The filename does not contain plaintext, but the audio contains the spoken text; hashes do not anonymize predictable words. Cache identity remains provider-specific: Frdic uses provider/text/language/voice, while ElevenLabs uses provider/language/text/model, the effective request parameters and output format. By default ElevenLabs excludes Voice ID from the key; enable **Cache ElevenLabs audio separately by Voice ID** to add the selected voice. API keys are never part of the cache key. Changing model or an effective voice parameter creates a separate cache entry in either mode. Settings omitted from the API request for a given model do not affect its cache key. French and English stay separate, even for identical text. There is **no automatic time-based expiry or scheduled cleanup**; files persist until removed, except that invalid MP3 entries or files whose playback fails are deleted individually. To clear stored audio, run **Clear Pronunciation Audio Cache** and confirm. This permanently removes regular SHA-256-named `.mp3` files in `audio-cache` for both providers, including matching old-format entries; it leaves temporary/unknown files, API keys, statistics and preferences alone. No individual provider filter is available because the hashed filenames do not reveal their provider. An in-progress pronunciation may create another cache entry after clearing, so avoid concurrent playback if an empty cache is desired. Future cache misses may require ElevenLabs credits. Old temporary `$TMPDIR/frdic-cache` files from previous versions are outside the command's scope and are not automatically deleted or reused.

## ElevenLabs parameters

This extension uses `POST /v1/text-to-speech/{voice_id}`. It deliberately exposes only parameters useful for short vocabulary/sentence playback, not the entire API.

| Parameter | Extension behaviour |
| --- | --- |
| `text` | Validated selected/formatted text, at most 175 characters |
| `voice_id` | Optional comma/newline-separated lists; blank uses French `FvmvwvObRqIHojkEGh5N` or English `bGnz83yTAb7caZSC7BBz`. With per-voice caching off (default), voices share the same cache and one is chosen on a miss. With it on, choose a voice each playback, then use its separate cache. Retries keep the same selected voice |
| `model_id` | Free text, default `eleven_v4`. Examples: `eleven_v4_turbo`, `eleven_v3`, `eleven_multilingual_v2`, `eleven_flash_v2_5`, `eleven_turbo_v2_5`. Letters, digits, underscore, hyphen and dot accepted; starts with a letter/digit, max 128 characters. Availability is checked by ElevenLabs, not the extension |
| `language_code` | Explicit `fr` / `en` for known models; omitted for Multilingual v2 and unknown models |
| `output_format` | Fixed `mp3_44100_128`, compatible with local `afplay` |
| `voice_settings.speed` | Legacy models only: default 1.0, restricted to 0.7–1.2. Not sent for v4/v3 |
| `voice_settings.stability` | Default 0.65, configurable 0–1; v3 maps to nearest 0 / 0.5 / 1 |
| `voice_settings.similarity_boost` | Default 0.75, configurable 0–1; not sent for v3 |
| `voice_settings.style` | Fixed 0 for legacy models; not sent for v4/v3 |
| `apply_text_normalization` | `auto`; no paid/enterprise normalization forced |

Single words are supported, but generated TTS is not a dictionary recording or a guarantee of the intended homograph pronunciation. Explicit language and a native-language voice help short/ambiguous text. Sentence context can resolve ambiguities. No artificial sentence or instruction is prepended to the selection. French frdic conjugation punctuation is retained for compatibility; ElevenLabs may interpret its question marks differently, so audition before using it as a learning reference.

Known models use their model-specific settings. For a manually entered **unknown model**, only `text` and `model_id` are sent in the request body: language, voice settings and normalization are omitted because their compatibility cannot be predicted. Consequently the Speed/Stability/Similarity preferences do not affect unknown models. ElevenLabs may reject an ID, require additional parameters, or return an error; under the existing policy, API errors place the Key in cooldown. Check the model documentation and access before using it. Other API facilities include speaker boost, seed, pronunciation dictionaries, context, streaming/timestamps and eligible-enterprise zero retention; they are not exposed.

## Troubleshooting HTTP 402

HTTP 402 alone does not identify the root cause. Credits, voice/API access, billing and plan restrictions can differ; a successful playground request must be compared using the same account/key, voice, model and endpoint. Never infer that every 402 means exhausted credits or that selecting v4 automatically fixes billing.

1. Reload/rebuild the extension and enter `eleven_v4` in **ElevenLabs Model** to match the successful request shown in the screenshot. The preference has changed from a dropdown to a text field; check its value after updating, because migration of a previously saved dropdown value is controlled by Raycast.
2. Match the successful request's Voice ID. The extension defaults do not bypass access restrictions.
3. If the failure was a 401 or a credit error, open **Manage ElevenLabs Keys → Reactivate Now (⌘R)** to clear the Invalid status. Other failures never disable a key, so there is nothing to reactivate. This is deliberate/manual: upgrading does not silently reactivate blocked keys or make billable requests.
4. Retry once. If it still fails, inspect **Last API error** in the details body. It now includes a bounded/redacted provider code and message (when returned as JSON), not just HTTP 402. A generic old `HTTP 402` cannot be retroactively expanded.
5. If sharing diagnostics, share only the sanitized error and non-secret model/voice settings, never an API key or unredacted request code.

The API endpoint and `xi-api-key` authentication remain unchanged. v4 uses only Stability and Similarity; Speed/Style are omitted according to official model documentation. No automatic model substitution is performed after an API error.

### Cache switching example

Pronounce the same text with **frdic only**, then **ElevenLabs only**: the two providers keep separate audio. Switching back reuses the earlier entry. With **per-voice caching off** (default), ElevenLabs checks text, language, model and effective request parameters before selecting a Voice ID; a cache hit is reused across voices. With **per-voice caching on**, it selects a Voice ID first and checks the cache for that specific voice. Switching the option does not delete or migrate either mode's files: shared and per-voice caches stay separate, and switching back reuses that mode's existing entries. On a miss the selected voice stays fixed across Key retries. Changing the model or an effective parameter creates another cache entry in both modes; switching back reuses the earlier one. For example, Speed is omitted for v4/v3, so changing it does not alter the cache key. Frdic's existing cache is unchanged.

In Default mode, a successful frdic cache hit wins and does not invoke ElevenLabs. In Random mode, the provider choice still happens first, followed by that provider's cache lookup; the configured proportion concerns choices, not necessarily API requests or successful playback.

**Previous ElevenLabs cache formats:** older entries hashed either the full configuration including Voice ID, or only provider/text/language. They lack sufficient metadata to safely match all requested model and parameter combinations. They are left untouched rather than guessed or deleted. The current shared format remains compatible when per-voice caching is off. Enabling per-voice caching creates separate entries and may require new ElevenLabs requests for each chosen voice; switching modes preserves both sets of entries. Existing Frdic entries are reused as before.

## Development checks

```sh
npm run typecheck
npm test
npm run build
```

Tests mock Raycast, network and playback: no real selected text, API key, paid request or playback is used. They cover strategy separation/fallback, key round robin/error quarantine/expiry, Unicode/privacy validation before translation, model compatibility, cache integrity and existing French preprocessing. Real API/account/voice access and Raycast UI interaction still need manual verification after configuration.

The installed Raycast API uses React 19 types; the extension's dev type dependency is aligned accordingly. Dependency audit currently reports inherited Raycast CLI dependency warnings (including minimatch and esbuild); no unrelated broad dependency upgrade or forced audit fix is applied.

## Official references

* ElevenLabs API: https://elevenlabs.io/docs/api-reference/text-to-speech/convert
* Models: https://elevenlabs.io/docs/overview/models
* v4 settings: https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech
* Language/accent: https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-do-i-select-the-language-and-accent
* Zero retention: https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode
* Raycast encrypted storage: https://developers.raycast.com/api-reference/storage
* Raycast command hotkeys: https://manual.raycast.com/command-aliases-and-hotkeys
