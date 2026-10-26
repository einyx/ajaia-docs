/**
 * Turns the recorded walkthrough into a narrated video.
 *
 *   OPENAI_API_KEY=sk-... node scripts/narrate.mjs
 *
 * Reads artifacts/narration.json (captured alongside the screen recording),
 * synthesises each segment with OpenAI TTS, and mixes the clips on the video
 * timeline at the timestamps the segments were recorded.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const artifacts = resolve(root, 'artifacts');
const videoDir = resolve(artifacts, 'video');
const clipsDir = resolve(videoDir, 'clips');

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY is required (voice-over uses OpenAI TTS).');
  process.exit(1);
}

const voice = process.env.TTS_VOICE ?? 'alloy';
const model = process.env.TTS_MODEL ?? 'gpt-4o-mini-tts';
const ffmpeg = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((bin) => existsSync(bin));
if (!ffmpeg) {
  console.error('ffmpeg not found (brew install ffmpeg).');
  process.exit(1);
}

const segments = JSON.parse(readFileSync(resolve(artifacts, 'narration.json'), 'utf8'));
const videoPath = resolve(videoDir, 'walkthrough.mp4');
if (!existsSync(videoPath)) {
  console.error('Run scripts/walkthrough.mjs first (artifacts/video/walkthrough.mp4 missing).');
  process.exit(1);
}

rmSync(clipsDir, { recursive: true, force: true });
mkdirSync(clipsDir, { recursive: true });

// 1. Synthesise one clip per segment.
const clips = [];
for (const [index, segment] of segments.entries()) {
  const clipPath = resolve(clipsDir, `clip-${String(index).padStart(2, '0')}.mp3`);
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, voice, input: segment.text, response_format: 'mp3' }),
  });

  if (!response.ok) {
    console.error(`TTS failed for segment ${index}: ${response.status} ${await response.text()}`);
    process.exit(1);
  }

  writeFileSync(clipPath, Buffer.from(await response.arrayBuffer()));
  clips.push({ path: clipPath, startMs: segment.startMs });
  console.log(`clip ${index + 1}/${segments.length} (${segment.text.slice(0, 48)}…)`);
}

// 2. Delay each clip to its timeline position and mix them under the video.
const delays = clips
  .map((clip, index) => `[${index + 1}:a]adelay=${clip.startMs}|${clip.startMs}[a${index}]`)
  .join(';');
const mix = clips.map((_, index) => `[a${index}]`).join('');
const filter = `${delays};${mix}amix=inputs=${clips.length}:normalize=0[mixout]`;

const outputPath = resolve(videoDir, 'walkthrough-narrated.mp4');
execFileSync(
  ffmpeg,
  [
    '-y',
    '-i', videoPath,
    ...clips.flatMap((_, index) => ['-i', resolve(clipsDir, `clip-${String(index).padStart(2, '0')}.mp3`)]),
    '-filter_complex', filter,
    '-map', '0:v',
    '-map', '[mixout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-movflags', '+faststart',
    outputPath,
  ],
  { stdio: 'ignore' },
);

console.log('narrated video: artifacts/video/walkthrough-narrated.mp4');
