import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

function getGitInfo() {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    const message = execSync('git log -1 --pretty=%s').toString().trim();
    const timestamp = execSync('git log -1 --pretty=%ci').toString().trim();
    const dirty = execSync('git status --porcelain').toString().trim().length > 0;
    return { sha, message, timestamp, dirty };
  } catch {
    return { sha: 'unknown', message: '', timestamp: '', dirty: false };
  }
}

const git = getGitInfo();
const cacheVersion = git.sha + (git.dirty ? '-dirty' : '');

// Thay placeholder __CACHE_VERSION__ trong dist/sw.js (file ở publicDir
// được Vite copy nguyên xi, không qua transform pipeline).
function swCacheVersion() {
  return {
    name: 'sw-cache-version',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js');
      const content = readFileSync(swPath, 'utf8');
      writeFileSync(swPath, content.replace(/__CACHE_VERSION__/g, cacheVersion));
    },
  };
}

export default defineConfig({
  define: {
    __GIT_SHA__: JSON.stringify(git.sha),
    __GIT_MESSAGE__: JSON.stringify(git.message),
    __GIT_TIMESTAMP__: JSON.stringify(git.timestamp),
  },
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  plugins: [swCacheVersion()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '^/api/': 'http://localhost:8788',
    },
  },
});
