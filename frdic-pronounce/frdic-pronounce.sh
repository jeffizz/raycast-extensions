#!/bin/bash
# frdic-pronounce.sh — pronounce a French word via frdic TTS
# Usage:
#   ./frdic-pronounce.sh <word>        # pronounce the given word
#   ./frdic-pronounce.sh                # pronounce the clipboard content's first word
#
# Requires: curl, base64, afplay (macOS built-in)

set -euo pipefail

API="https://api.frdic.com/api/v2/speech/speakweb"
PREFIX="QYN"
CACHE_DIR="${TMPDIR:-/tmp}/frdic-cache"
mkdir -p "$CACHE_DIR"

if [[ $# -ge 1 ]]; then
  WORD="$1"
else
  WORD="$(pbpaste | grep -oE "[[:alpha:]À-ÿ'’-]+" | head -n1 || true)"
fi

if [[ -z "$WORD" ]]; then
  echo "No word found (argument or clipboard)." >&2
  exit 1
fi

B64="$(printf '%s' "$WORD" | base64)"
URL="${API}?langid=fr&txt=${PREFIX}${B64}"
MP3="$CACHE_DIR/${B64}.mp3"

if [[ ! -s "$MP3" ]]; then
  curl -sfL -H 'User-Agent: Mozilla/5.0' "$URL" -o "$MP3"
fi

echo "🔊 $WORD"
afplay "$MP3"
