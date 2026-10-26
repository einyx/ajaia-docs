/**
 * Turns the recorded walkthrough into a narrated video.
 *
 *   node scripts/narrate.mjs --prepare   # synthesise clips + record durations
 *   node scripts/narrate.mjs              # mix the clips onto the capture
 *
 * The text lives in scripts/narration-script.mjs so the script and the captions
 * can never drift apart. Voice-over comes from OpenAI TTS when OPENAI_API_KEY is
 * set, otherwise from macOS `say` — a platform feature, so the video can be
 * re-recorded without a key or a network call.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BEATS } from './narration-script.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const artifacts = resolve(root, 'artifacts');
const videoDir = resolve(artifacts, 'video');
const clipsDir = resolve(videoDir, 'clips');

const apiKey = process.env.OPENAI_API_KEY;
const provider = apiKey ? 'openai' : 'say';
const voice = process.env.TTS_VOICE ?? 'onyx';
const macVoice = process.env.SAY_VOICE ?? 'Alex';
const model = process.env.TTS_MODEL ?? 'gpt-4o-mini-tts';
// Steers delivery on the newer model; ignored by the legacy tts-1 models.
const instructions =
  process.env.TTS_INSTRUCTIONS ??
  'Warm, confident product-engineer narration. Conversational and unhurried, like explaining a build to a colleague rather than reading a manual. Clear diction, natural pauses, no announcer voice.';
const ffmpeg = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((bin) => existsSync(bin));
const ffprobe = ['/opt/homebrew/bin/ffprobe', '/usr/local/bin/ffprobe'].find((bin) => existsSync(bin));
if (!ffmpeg) {
  console.error('ffmpeg not found (brew install ffmpeg).');
  process.exit(1);
}

const prepare = process.argv.includes('--prepare');
if (prepare) rmSync(clipsDir, { recursive: true, force: true });
mkdirSync(clipsDir, { recursive: true });
// 1. Synthesise one clip per beat (requests run concurrently).
const durations = {};
const CONCURRENCY = 6;

async function synthesise(beat) {
  const clipPath = resolve(clipsDir, `${beat.id}.mp3`);

  if (provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        voice,
        input: beat.text,
        response_format: 'mp3',
        ...(model.startsWith('gpt-4o-mini-tts') ? { instructions } : {}),
      }),
    });

    if (!response.ok) {
      console.error(`TTS failed for beat ${beat.id}: ${response.status} ${await response.text()}`);
      process.exit(1);
    }

    writeFileSync(clipPath, Buffer.from(await response.arrayBuffer()));
  } else {
    // macOS `say` writes AIFF; transcode so every clip is an mp3 the mixer can read.
    const aiffPath = resolve(clipsDir, `${beat.id}.aiff`);
    execFileSync('say', ['-v', macVoice, '-o', aiffPath, beat.text]);
    execFileSync(ffmpeg, ['-y', '-i', aiffPath, '-ar', '44100', '-ac', '1', '-b:a', '128k', clipPath], {
      stdio: 'ignore',
    });
    rmSync(aiffPath);
  }

  const seconds = ffprobe
    ? execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clipPath], {
        encoding: 'utf8',
      }).trim()
    : '0';
  durations[beat.id] = Math.round(Number(seconds) * 1000);
  console.log(`clip ${beat.id}: ${(durations[beat.id] / 1000).toFixed(1)}s`);
}

for (let index = 0; index < BEATS.length; index += CONCURRENCY) {
  const batch = BEATS.slice(index, index + CONCURRENCY);
  // `--prepare` refreshes every clip; the mix pass reuses what is already there.
  await Promise.all(
    batch.map((beat) => (prepare || !existsSync(resolve(clipsDir, `${beat.id}.mp3`)) ? synthesise(beat) : null)),
  );
}

// Clip durations let the recorder pace the screen capture to the voice-over.
for (const beat of BEATS) {
  const clipPath = resolve(clipsDir, `${beat.id}.mp3`);
  const seconds = ffprobe
    ? execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clipPath], {
        encoding: 'utf8',
      }).trim()
    : '0';
  durations[beat.id] = Math.round(Number(seconds) * 1000);
}
writeFileSync(resolve(artifacts, 'narration-durations.json'), JSON.stringify(durations, null, 2));
console.log('clip durations written: artifacts/narration-durations.json');

if (process.argv.includes('--prepare')) {
  console.log('prepare pass done — clips are ready for the paced recording');
  process.exit(0);
}

// 2. Delay each clip to its recorded position and mix them under the video.
const timelinePath = resolve(artifacts, 'narration.json');
if (!existsSync(timelinePath)) {
  console.error('Run scripts/walkthrough.mjs first (artifacts/narration.json missing).');
  process.exit(1);
}

const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const videoPath = resolve(videoDir, 'walkthrough.mp4');
if (!existsSync(videoPath)) {
  console.error('Run scripts/walkthrough.mjs first (artifacts/video/walkthrough.mp4 missing).');
  process.exit(1);
}

const delays = timeline
  .map((entry, index) => `[${index + 1}:a]adelay=${entry.startMs}|${entry.startMs}[a${index}]`)
  .join(';');
const mix = timeline.map((_, index) => `[a${index}]`).join('');
const filter = `${delays};${mix}amix=inputs=${timeline.length}:normalize=0[mixout]`;

// The narrated cut is the deliverable: public/ is what Vite ships, so the
// live URL serves exactly this file.
const outputPath = resolve(root, 'public/walkthrough.mp4');
execFileSync(
  ffmpeg,
  [
    '-y',
    '-i', videoPath,
    ...timeline.flatMap((entry) => ['-i', resolve(clipsDir, `${entry.id}.mp3`)]),
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

console.log('narrated video: public/walkthrough.mp4');

// Keep a copy with the source so the repository carries the deliverable too.
const docsVideo = resolve(root, 'docs/walkthrough.mp4');
mkdirSync(dirname(docsVideo), { recursive: true });
cpSync(outputPath, docsVideo);
console.log('narrated video copy: docs/walkthrough.mp4');
