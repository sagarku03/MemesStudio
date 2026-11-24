#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, platform } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const REPO_DIR = dirname(__filename);
const HOME = homedir();

console.log('\n🚀 Starting MemesStudio Automated One-Click Setup...\n');

// 1. Check and Auto-Install FFmpeg
console.log('📦 Step 1: Checking System Dependencies (FFmpeg)...');
let hasFfmpeg = false;
try {
  const check = spawnSync('command -v ffmpeg', { shell: true, stdio: 'pipe' });
  if (check.status === 0 && check.stdout.toString().trim()) {
    hasFfmpeg = true;
  }
} catch (_) {}

if (hasFfmpeg) {
  console.log('   ✅ FFmpeg is already installed!');
} else {
  console.log('   ⚠️ FFmpeg not found! Attempting automatic installation...');
  try {
    const isTermux = existsSync('/data/data/com.termux') || Boolean(process.env.TERMUX_VERSION);
    if (isTermux) {
      console.log('   📱 Termux detected, running: pkg install -y ffmpeg');
      execSync('pkg install -y ffmpeg', { stdio: 'inherit' });
    } else if (platform() === 'linux') {
      console.log('   🐧 Linux detected, running: apt-get install -y ffmpeg');
      execSync('sudo apt update && sudo apt install -y ffmpeg', { stdio: 'inherit' });
    } else if (platform() === 'darwin') {
      console.log('   🍏 macOS detected, running: brew install ffmpeg');
      execSync('brew install ffmpeg', { stdio: 'inherit' });
    }
    console.log('   ✅ FFmpeg installed successfully!');
  } catch (err) {
    console.warn('   ⚠️ Could not auto-install FFmpeg. Please install it manually with: pkg install ffmpeg');
  }
}

// 2. Configure MCP Server in mcp_config.json
console.log('\n🤖 Step 2: Configuring MCP Server...');
const potentialConfigPaths = [
  join(HOME, '.gemini/config/mcp_config.json'),
  join(HOME, '.gemini/antigravity/mcp_config.json'),
  join(HOME, '.gemini/antigravity-cli/mcp_config.json')
];

let mcpConfigFound = false;
for (const configPath of potentialConfigPaths) {
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    try { mkdirSync(configDir, { recursive: true }); } catch (_) {}
  }

  let configObj = { mcpServers: {} };
  if (existsSync(configPath)) {
    try {
      configObj = JSON.parse(readFileSync(configPath, 'utf8'));
      if (!configObj.mcpServers) configObj.mcpServers = {};
    } catch (_) {
      configObj = { mcpServers: {} };
    }
  }

  const mcpServerScript = join(REPO_DIR, 'mcp-server.mjs');
  configObj.mcpServers['meme_studio_mcp'] = {
    command: process.execPath,
    args: [mcpServerScript],
    env: {
      PATH: process.env.PATH || '/data/user/0/com.termux/files/usr/bin:/system/bin'
    }
  };

  try {
    writeFileSync(configPath, JSON.stringify(configObj, null, 2), 'utf8');
    console.log(`   ✅ Registered meme_studio_mcp in: ${configPath}`);
    mcpConfigFound = true;
  } catch (err) {
    console.error(`   ❌ Failed to write config to ${configPath}:`, err.message);
  }
}

if (!mcpConfigFound) {
  console.log('   ℹ️ mcp_config.json created in default location.');
}

// 3. Install Skill (SKILL.md)
console.log('\n🧠 Step 3: Installing Meme-Studio Skill...');
const skillDestDir = join(HOME, '.gemini/config/skills/meme-studio');
try {
  mkdirSync(skillDestDir, { recursive: true });
  const srcSkill = join(REPO_DIR, 'SKILL.md');
  const destSkill = join(skillDestDir, 'SKILL.md');
  copyFileSync(srcSkill, destSkill);
  console.log(`   ✅ Skill installed to: ${destSkill}`);
} catch (err) {
  console.error('   ❌ Failed to install skill:', err.message);
}

// 4. Create Output Directories
console.log('\n📁 Step 4: Setting up Output Directories...');
const downloadDir = existsSync('/sdcard')
  ? '/sdcard/Download/Memes'
  : join(HOME, 'Downloads', 'Memes');
const carouselDir = join(downloadDir, 'Carousels');

try {
  mkdirSync(downloadDir, { recursive: true });
  mkdirSync(carouselDir, { recursive: true });
  console.log(`   ✅ Single memes output: ${downloadDir}`);
  console.log(`   ✅ Carousels output: ${carouselDir}`);
} catch (_) {}

// 5. Verification & Health Check
console.log('\n🔍 Step 5: Running System Healthcheck...');
const fontPath = join(REPO_DIR, 'assets/fonts/Montserrat-Black.ttf');
const emojiPath = join(REPO_DIR, 'assets/emojis/joy.png');

console.log(`   • Montserrat Black Font: ${existsSync(fontPath) ? '✅ OK' : '❌ Missing'}`);
console.log(`   • iOS 3D Emojis: ${existsSync(emojiPath) ? '✅ OK' : '❌ Missing'}`);
console.log(`   • MCP Server Script: ${existsSync(join(REPO_DIR, 'mcp-server.mjs')) ? '✅ OK' : '❌ Missing'}`);
console.log(`   • Trend Hunter: ${existsSync(join(REPO_DIR, 'trend_hunter.mjs')) ? '✅ OK' : '❌ Missing'}`);

// 6. Setup Git Pre-Push Hook for Auto-Versioning
console.log('\n🔄 Step 6: Configuring Auto-Versioning Hook...');
const gitHookDir = join(REPO_DIR, '.git/hooks');
if (existsSync(gitHookDir)) {
  const prePushScript = `#!/usr/bin/env bash
# Auto-bump patch version before push
if [ -z "$SKIP_AUTO_BUMP" ]; then
  echo "🚀 Auto-bumping version in package.json..."
  node ./scripts/bump-version.mjs
  git add package.json
  git commit -m "chore(release): bump version [skip ci]" --no-verify || true
fi
`;
  try {
    writeFileSync(join(gitHookDir, 'pre-push'), prePushScript, { mode: 0o755 });
    console.log('   ✅ Git pre-push auto-bump hook installed!');
  } catch (_) {}
}

console.log('\n======================================================');
console.log('🎉 MemesStudio Setup Completed Successfully!');
console.log('======================================================\n');
console.log('You can now generate viral memes instantly with:');
console.log('👉 node ./mcp-server.mjs');
console.log('👉 Or ask your AI agent: "Create a trending meme for @soo_funny_memes"!\n');
