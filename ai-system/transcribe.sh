#!/bin/zsh
# Transcribe a YouTube video to text
# Usage: ./transcribe.sh <youtube-url> [model]
# Models: tiny, base, small, medium, large (default: base)

set -e

URL="$1"
MODEL="${2:-base}"
OUTDIR="/Users/davidmudge/Desktop/Elowen/transcripts"

if [ -z "$URL" ]; then
  echo "Usage: ./transcribe.sh <youtube-url> [model]"
  echo "Models: tiny (fastest), base (default), small, medium, large (best quality)"
  exit 1
fi

export PATH="$PATH:$HOME/Library/Python/3.9/bin"

mkdir -p "$OUTDIR"

echo "⏬ Downloading audio..."
TITLE=$(yt-dlp --print "%(title)s" "$URL" 2>/dev/null | tr '/' '-' | tr -d '"')
yt-dlp -x --audio-format mp3 -o "$OUTDIR/%(title)s.%(ext)s" "$URL" 2>/dev/null

MP3FILE="$OUTDIR/$TITLE.mp3"

echo "🎙️ Transcribing with Whisper ($MODEL model)..."
whisper "$MP3FILE" --model "$MODEL" --output_dir "$OUTDIR" --output_format txt 2>/dev/null

TXTFILE="$OUTDIR/$TITLE.txt"

echo ""
echo "✅ Done! Transcript saved to:"
echo "   $TXTFILE"
echo ""
echo "📋 Preview (first 10 lines):"
head -10 "$TXTFILE"
