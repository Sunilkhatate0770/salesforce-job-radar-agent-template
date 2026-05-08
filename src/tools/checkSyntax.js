import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.vercel',
  'build',
  'coverage',
  'dist',
  'node_modules'
]);

function collectJavaScriptFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectJavaScriptFiles(fullPath);
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) return [];
    return [fullPath];
  });
}

const files = collectJavaScriptFiles(root)
  .filter((file) => statSync(file).size > 0)
  .sort((a, b) => relative(root, a).localeCompare(relative(root, b)));

const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    failures.push({
      file: relative(root, file),
      output: `${result.stdout || ''}${result.stderr || ''}`.trim()
    });
  }
}

if (failures.length > 0) {
  console.error(`Syntax check failed for ${failures.length} file(s):`);
  failures.forEach((failure) => {
    console.error(`\n${failure.file}`);
    console.error(failure.output);
  });
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
