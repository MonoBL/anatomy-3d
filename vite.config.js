import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Stamped into the bundle so the About panel can say exactly which build is
// running — useful the moment the atlas is on someone else's iPad and they
// report something you have already fixed.
const commit = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return dirty ? `${hash}+` : hash;
  } catch {
    return 'unknown';
  }
})();

export default defineConfig({
  server: { port: 5180, open: false },
  build: { target: 'es2022', assetsInlineLimit: 0 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT__: JSON.stringify(commit),
  },
});
