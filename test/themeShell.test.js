import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('theme shell defaults to dark and uses a single guarded toggle binding', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const app = fs.readFileSync('app.js', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');

  assert.ok(html.includes("const preferenceKey = 'sfjr_theme_v2'"));
  assert.ok(html.includes("let theme = normalize(stored || 'dark')"));
  assert.ok(html.includes("btn.dataset.themeBound = 'true'"));
  assert.ok(app.includes("themeBtn && !themeBtn.dataset.themeBound"));
  assert.ok(app.includes("window.toggleSfjrTheme"));

  const lightBlockStart = css.indexOf('[data-theme=\"light\"]');
  const firstRootBlock = css.indexOf(':root {');
  assert.ok(lightBlockStart >= 0, 'expected explicit light-theme block');
  assert.ok(firstRootBlock > lightBlockStart, 'legacy dark :root block should remain after explicit light block');
  assert.equal(css.includes(':root,\n[data-theme=\"light\"]'), false, 'root must not default to light theme');
});
