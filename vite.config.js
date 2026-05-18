import { defineConfig } from 'vite';
import { resolve } from 'path';
import { execSync } from 'child_process';

function getGitInfo() {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    const message = execSync('git log -1 --pretty=%s').toString().trim();
    const timestamp = execSync('git log -1 --pretty=%ci').toString().trim();
    return { sha, message, timestamp };
  } catch {
    return { sha: 'unknown', message: '', timestamp: '' };
  }
}

const git = getGitInfo();

export default defineConfig({
  define: {
    __GIT_SHA__: JSON.stringify(git.sha),
    __GIT_MESSAGE__: JSON.stringify(git.message),
    __GIT_TIMESTAMP__: JSON.stringify(git.timestamp),
  },
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
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
