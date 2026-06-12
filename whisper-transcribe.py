#!/usr/bin/env python3
"""
Local Whisper transcription script.
Requires: pip install openai-whisper
"""
import sys
import os
import whisper


def setup_stdio_utf8():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")


def write_stdout(text):
    """Write UTF-8 to stdout without Windows cp1252 encoding errors."""
    sys.stdout.buffer.write(text.encode("utf-8"))
    sys.stdout.buffer.write(b"\n")
    sys.stdout.buffer.flush()


def write_stderr(text):
    sys.stderr.buffer.write(text.encode("utf-8"))
    sys.stderr.buffer.write(b"\n")
    sys.stderr.buffer.flush()


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
        write_stdout(result["text"].strip())
        return 0
    except Exception as e:
        write_stderr(f"Error: {str(e)}")
        return 1


if __name__ == "__main__":
    setup_stdio_utf8()
    setup_ffmpeg_path()
    if len(sys.argv) < 2:
        write_stderr("Usage: python whisper-transcribe.py <audio_file> [model] [language]")
        sys.exit(1)

    audio_path = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "base"
    language = sys.argv[3] if len(sys.argv) > 3 else "auto"
    sys.exit(transcribe_audio(audio_path, model, language))
