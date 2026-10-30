# French Pronounce (frdic)

A Raycast extension that pronounces French words using the frdic (法语助手) TTS API.

## How it works

1. The `French Pronounce (Selected Text)` command reads selected text using Raycast's selected-text API and never reads the clipboard. The separate `French Pronounce (Clipboard)` command reads the complete clipboard text.
2. Base64-encodes the word (UTF-8) and appends it to the frdic speech API:

   ```
   https://api.frdic.com/api/v2/speech/speakweb?langid=fr&txt=QYN<Base64>
   ```

   `QYN` is the API's fixed prefix.

3. Downloads the returned MP3 (cached in `$TMPDIR/frdic-cache`) and plays it with `afplay`.

## Setup

1. Import into Raycast: `npm run import` (requires the Raycast CLI) or open Raycast → Extensions → Import Extension, and pick this folder.
2. Assign a hotkey to the "French Pronounce" command in Raycast settings.
3. Grant Accessibility permission to Raycast (System Settings → Privacy & Security → Accessibility) so it can read the selected text.

## Usage

- Select text in any app, then use `French Pronounce (Selected Text)`.
- Use `French Pronounce (Clipboard)` for text already in the clipboard.
- In preferences, you can disable pronunciation to run translation only.
- In preferences, `Translation Display` can switch between toast and a Raycast result page (default is toast).
- Use `Toggle Translation` to quickly switch translation on/off at runtime (without changing preferences).
- When the clipboard contains six or seven tab/newline-separated single words (for example, cells copied from Excel), the clipboard command formats them as a conjugation prompt: each form except the last gets `?`, and forms are joined with tabs. With seven cells, the first cell is treated as the infinitive and emitted in uppercase with a trailing period.
- Assign different hotkeys to the two commands.
