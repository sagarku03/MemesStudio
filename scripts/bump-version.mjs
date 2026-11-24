#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoDir = join(dirname(__filename), '..');
const pkgPath = join(repoDir, 'package.json');

try {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version || '1.0.0';
  const parts = currentVersion.split('.').map(n => parseInt(n, 10) || 0);

  // SemVer: Major.Minor.Patch (Increment Patch)
  parts[2] += 1;
  const newVersion = parts.join('.');

  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  console.log(`\n📦 Auto-Version Bumped: ${currentVersion}  👉  ${newVersion}\n`);
} catch (err) {
  console.error('Failed to bump version:', err.message);
  process.exit(1);
}
