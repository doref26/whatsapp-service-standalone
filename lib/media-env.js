import { existsSync } from 'fs';
import { dirname, join } from 'path';

export function resolvePythonExecutable() {
  if (process.env.PYTHON_PATH && existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  const candidates = [
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    'python',
    'python3',
  ];

  for (const candidate of candidates) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    return candidate;
  }

  return 'python';
}

export function resolveFfmpegExecutable() {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  return 'ffmpeg';
}

export function buildMediaExecEnv() {
  const env = { ...process.env };
  env.PYTHONIOENCODING = 'utf-8';
  env.PYTHONUTF8 = '1';
  if (process.env.FFMPEG_PATH) {
    const ffmpegDir = dirname(process.env.FFMPEG_PATH);
    env.PATH = `${ffmpegDir};${env.PATH || ''}`;
  }
  return env;
}
