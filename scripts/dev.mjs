/**
 * Local dev: API (node:sqlite) + Vite dev server with an /api proxy.
 *   npm run dev  ->  http://localhost:5173
 */
import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['src/server/local.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};

process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});

for (const child of children) {
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) process.exit(code);
  });
}
