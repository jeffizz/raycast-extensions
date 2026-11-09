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
2. Voice IDs are optional: blank/missing French uses `FvmvwvObRqIHojkEGh5N`; English uses `bGnz83yTAb7caZSC7BBz`. These are extension defaults requested by the user, not guaranteed universally accessible/free ElevenLabs voices. Explicit IDs override them. Use voices available to every account/key being rotated. **frdic English Voice** only affects frdic, never ElevenLabs.
3. Assign hotkeys to the two Selected Text commands and **Cycle Speech Strategy**. In Raycast select the command, open **Configure Command → Set Hotkey**, or use **Settings → Shortcuts**.
4. Accessibility access may be needed for selected text. No clipboard fallback is used when selection is unavailable.

## Commands

| Command | Behaviour |
| --- | --- |
| French Pronounce (Selected Text) | Validate selection, strip boundary parenthetical annotations, retain six/seven-cell conjugation formatting, pronounce in French |
| English Pronounce (Selected Text) | Validate selection and pronounce in English |
| Cycle Speech Strategy | Persistently cycle Default → frdic only → ElevenLabs only → Default; HUD shows result; supports a global hotkey |
| Select Speech Strategy | View current strategy and select one directly |
| Manage ElevenLabs Keys | Add/edit credentials and labels, enable/disable/delete, reactivate, view usage/cooldown |
| Toggle Translation | Existing optional Chinese translation switch |

Only two **pronunciation/input** commands remain; the other commands manage settings. Optional translation toast Copy actions still write a translation to the clipboard when explicitly clicked; they never read it.

## Provider strategies

* **Default:** fetch/play cached frdic audio first; if audio acquisition fails (HTTP, timeout, empty/non-MP3 response), try ElevenLabs.
* **frdic only:** never use ElevenLabs, including its cache.
* **ElevenLabs only:** never use frdic, including its cache.
* A local `afplay`/output-device failure does not trigger fallback or disable a key. The associated cache entry is removed so the next run can download again.
* frdic requests time out after 12 seconds; each ElevenLabs attempt after 25 seconds. Requests never follow redirects.

## ElevenLabs keys and statistics

Keys are stored in Raycast's extension-local **encrypted LocalStorage**, not source files, preferences exports, audio cache names, or logs. Credentials are entered in password fields and never displayed. The secret is sent only as the `xi-api-key` header to the fixed ElevenLabs HTTPS endpoint. Raw server error bodies are not stored. Bounded JSON error fields (HTTP status, provider code/status/type, and redacted message) are retained for diagnosis; known credentials and submitted text are removed, with additional heuristic redaction. Do not treat heuristic redaction as a universal guarantee.

* Round robin is persisted across runs. Disabled/cooling keys are skipped. Each eligible key is attempted at most once per invocation.
* **Any request failure** blocks that key for exactly seven days, then tries another key. This includes 401, 402, 403, 429, 5xx, invalid audio, timeouts and network failures. This is the requested policy, not a diagnosis that the key itself is invalid: an outage, unavailable voice or invalid model configuration can temporarily block all keys.
* **Reactivate Now** clears error/cooldown and current-cycle counters and enables the key. Expired cooldowns reset the same state automatically on the next read/request (the open management UI refreshes every 30 seconds); no background process is required. Manually disabled keys stay disabled after expiry.
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

Audio is cached persistently, unencrypted, under `environment.supportPath/audio-cache`, with SHA-256 filenames and restrictive file permissions. The filename does not contain plaintext, but the audio contains the spoken text; hashes do not anonymize predictable words. Cache includes provider, language, voice, model and settings, not keys; switching a key does not regenerate cached audio. Delete the audio-cache directory to remove cached speech. Old temporary `$TMPDIR/frdic-cache` files from previous versions are not automatically deleted or reused.

## ElevenLabs parameters

This extension uses `POST /v1/text-to-speech/{voice_id}`. It deliberately exposes only parameters useful for short vocabulary/sentence playback, not the entire API.

| Parameter | Extension behaviour |
| --- | --- |
| `text` | Validated selected/formatted text, at most 175 characters |
| `voice_id` | Optional overrides; French default `FvmvwvObRqIHojkEGh5N`, English default `bGnz83yTAb7caZSC7BBz` |
| `model_id` | New default `eleven_v4`; also v3, Multilingual v2, legacy Flash/Turbo v2.5. Existing saved model selections remain unchanged until explicitly changed |
| `language_code` | Explicit `fr` / `en`; omitted for Multilingual v2 because it is unsupported |
| `output_format` | Fixed `mp3_44100_128`, compatible with local `afplay` |
| `voice_settings.speed` | Legacy models only: default 1.0, restricted to 0.7–1.2. Not sent for v4/v3 |
| `voice_settings.stability` | Default 0.65, configurable 0–1; v3 maps to nearest 0 / 0.5 / 1 |
| `voice_settings.similarity_boost` | Default 0.75, configurable 0–1; not sent for v3 |
| `voice_settings.style` | Fixed 0 for legacy models; not sent for v4/v3 |
| `apply_text_normalization` | `auto`; no paid/enterprise normalization forced |

Single words are supported, but generated TTS is not a dictionary recording or a guarantee of the intended homograph pronunciation. Explicit language and a native-language voice help short/ambiguous text. Sentence context can resolve ambiguities. No artificial sentence or instruction is prepended to the selection. French frdic conjugation punctuation is retained for compatibility; ElevenLabs may interpret its question marks differently, so audition before using it as a learning reference.

Other API facilities include speaker boost, seed (best-effort reproducibility), pronunciation dictionaries, previous/next text or request context, streaming/timestamps, output formats, and eligible-enterprise zero retention. They are not necessary for this first short-text workflow and are not exposed. Model-specific support differs; no assumption is made that newer expressive models are better for isolated vocabulary.

## Troubleshooting HTTP 402

HTTP 402 alone does not identify the root cause. Credits, voice/API access, billing and plan restrictions can differ; a successful playground request must be compared using the same account/key, voice, model and endpoint. Never infer that every 402 means exhausted credits or that selecting v4 automatically fixes billing.

1. Reload/rebuild the extension and explicitly select **Eleven v4** to match the successful request shown in the screenshot; existing saved Flash choices are preserved.
2. Match the successful request's Voice ID. The extension defaults do not bypass access restrictions.
3. Open **Manage ElevenLabs Keys → Reactivate Now (⌘R)** to clear the previous 7-day cooldown. This is deliberate/manual: upgrading does not silently reactivate blocked keys or make billable requests.
4. Retry once. If it still fails, inspect **Last API error** in the details body. It now includes a bounded/redacted provider code and message (when returned as JSON), not just HTTP 402. A generic old `HTTP 402` cannot be retroactively expanded.
5. If sharing diagnostics, share only the sanitized error and non-secret model/voice settings, never an API key or unredacted request code.

The API endpoint and `xi-api-key` authentication remain unchanged. v4 uses only Stability and Similarity; Speed/Style are omitted according to official model documentation. No automatic model substitution is performed after an API error.

### Cache switching example

Cache identity already includes the provider, not just text. Pronounce the same text with **frdic only**, then **ElevenLabs only**: each provider downloads its own audio once. Switch back to either: its previous cached file is reused. Voice/model/parameter changes have separate cache entries; switching back retains earlier entries. Changing a key alone does not invalidate audio. In Default mode, a successful frdic cache hit wins and does not invoke ElevenLabs. A regression test verifies successful caches for both providers and switching voices/models back and forth.

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
