import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const singleDir = path.join(rootDir, 'dist-single');

console.log('1/2 Running TypeScript check & Vite production build...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

console.log('2/2 Inlining bundle into standalone single-file HTML...');
let html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

// Inline any CSS stylesheets
html = html.replace(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g, (match, href) => {
  const relPath = href.replace(/^\.\//, '').replace(/^\//, '');
  const cssPath = path.join(distDir, relPath);
  if (!fs.existsSync(cssPath)) return match;
  const css = fs.readFileSync(cssPath, 'utf8');
  return `<style>\n${css}\n</style>`;
});

// Inline module JS bundle (safely escaping any literal </script> sequences)
html = html.replace(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g, (match, src) => {
  const relPath = src.replace(/^\.\//, '').replace(/^\//, '');
  const jsPath = path.join(distDir, relPath);
  if (!fs.existsSync(jsPath)) return match;
  const js = fs.readFileSync(jsPath, 'utf8').replace(/<\/script>/gi, '<\\/script>');
  return `<script type="module">\n${js}\n</script>`;
});

fs.mkdirSync(singleDir, { recursive: true });
const outFile = path.join(singleDir, '回梦游仙·青春版.html');
fs.writeFileSync(outFile, html, 'utf8');

const sizeKB = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`✅ Standalone Single-HTML built: ${outFile} (${sizeKB} KB)`);
