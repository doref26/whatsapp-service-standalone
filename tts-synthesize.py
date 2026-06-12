#!/usr/bin/env python3
"""
Text-to-speech via Microsoft Edge TTS (free, good Hebrew voices).
Requires: pip install edge-tts

Usage: python tts-synthesize.py <text_file> <output.mp3> [options.json]
"""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts


def load_options(options_path=None):
    defaults = {
        "voice": "he-IL-HilaNeural",
        "rate": "+0%",
        "pitch": "+0Hz",
        "volume": "+0%",
    }
    if not options_path:
        return defaults
    data = json.loads(Path(options_path).read_text(encoding="utf-8"))
    return {**defaults, **data}


async def synthesize(text, output_path, options):
    communicate = edge_tts.Communicate(
        text,
        options["voice"],
        rate=options.get("rate", "+0%"),
        pitch=options.get("pitch", "+0Hz"),
        volume=options.get("volume", "+0%"),
    )
    await communicate.save(output_path)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python tts-synthesize.py <text_file> <output.mp3> [options.json]", file=sys.stderr)
        sys.exit(1)

    text_path = Path(sys.argv[1])
    output_path = sys.argv[2]
    options_path = sys.argv[3] if len(sys.argv) > 3 else None
    text = text_path.read_text(encoding="utf-8")
    options = load_options(options_path)

    try:
        asyncio.run(synthesize(text, output_path, options))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
