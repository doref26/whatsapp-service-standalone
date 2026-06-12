import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePythonExecutable() {
  if (process.env.PYTHON_PATH && existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }

  const candidates = [
    process.env.PYTHON_PATH,
    'python',
    'python3',
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
    'C:\\Python310\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python312\\python.exe',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes('\\') || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    return candidate;
  }

  return 'python';
}

class TranscriptionService {
  getProviderName() {
    return config.whisper.provider;
  }

  async transcribe(audioPath) {
    try {
      if (config.whisper.provider === 'openai' && config.whisper.openaiApiKey) {
        return await this.transcribeWithOpenAI(audioPath);
      }
      return await this.transcribeWithLocalWhisper(audioPath);
    } catch (error) {
      console.error('❌ Transcription error:', error.message);
      if (error.stderr) console.error('   stderr:', String(error.stderr).substring(0, 500));
      return null;
    }
  }

  async transcribeWithOpenAI(audioPath) {
    const { default: fetch } = await import('node-fetch');
    const { createReadStream } = await import('fs');
    const FormData = (await import('form-data')).default;

    console.log('🎤 Transcribing voice message with OpenAI Whisper API...');
    const form = new FormData();
    form.append('file', createReadStream(audioPath));
    form.append('model', 'whisper-1');
    if (config.whisper.language) {
      form.append('language', config.whisper.language);
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whisper.openaiApiKey}`,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = (data.text || '').trim();
    if (text) console.log(`✅ Transcription: "${text.substring(0, 100)}..."`);
    return text || null;
  }

  async transcribeWithLocalWhisper(audioPath) {
    console.log('🎤 Transcribing voice message with local Whisper...');
    const scriptPath = join(__dirname, 'whisper-transcribe.py');
    const model = config.whisper.model;
    const language = config.whisper.language || 'auto';
    const pythonExe = resolvePythonExecutable();

    console.log(`   Python: ${pythonExe}`);
    console.log(`   Model: ${model}, language: ${language}`);

    const env = { ...process.env };
    if (process.env.FFMPEG_PATH) {
      const ffmpegDir = dirname(process.env.FFMPEG_PATH);
      env.PATH = `${ffmpegDir};${env.PATH || ''}`;
    }

    const { stdout, stderr } = await execFileAsync(
      pythonExe,
      [scriptPath, audioPath, model, language],
      {
        maxBuffer: 1024 * 1024 * 10,
        env,
        windowsHide: true,
      },
    );

    if (stderr?.trim()) {
      console.log(`   whisper log: ${stderr.trim().substring(0, 300)}`);
    }

    const text = stdout.trim();
    if (!text) {
      throw new Error('Whisper returned empty transcription');
    }

    console.log(`✅ Transcription: "${text.substring(0, 100)}..."`);
    return text;
  }

  getTranscriptionUnavailableMessage() {
    return (
      '🎤 I received a voice message but transcription is not available.\n\n' +
      'Install local Whisper: pip install openai-whisper\n' +
      'Or set TRANSCRIPTION_PROVIDER=openai and OPENAI_API_KEY in .env\n\n' +
      'You can also send your message as text.'
    );
  }
}

export default TranscriptionService;
