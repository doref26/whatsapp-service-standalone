#!/usr/bin/env python3
"""
Local Whisper transcription script.
Requires: pip install openai-whisper
"""
import sys
import os
import whisper


def setup_ffmpeg_path():
    ffmpeg_path = os.environ.get("FFMPEG_PATH")
    if ffmpeg_path and os.path.isfile(ffmpeg_path):
        ffmpeg_dir = os.path.dirname(ffmpeg_path)
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")


def transcribe_audio(audio_path, model_name="base", language="auto"):
    try:
        model = whisper.load_model(model_name)
        kwargs = {"task": "transcribe"}
        if language and language.lower() != "auto":
            kwargs["language"] = language
        result = model.transcribe(audio_path, **kwargs)
        print(result["text"].strip())
        return 0
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    setup_ffmpeg_path()
    if len(sys.argv) < 2:
        print("Usage: python whisper-transcribe.py <audio_file> [model] [language]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "base"
    language = sys.argv[3] if len(sys.argv) > 3 else "auto"
    sys.exit(transcribe_audio(audio_path, model, language))
