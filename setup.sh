#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Error: Node.js is required but not installed."
  exit 1
fi

chmod +x "$DIR/mcp-server.mjs" "$DIR/setup.mjs" 2>/dev/null || true
node "$DIR/setup.mjs"
