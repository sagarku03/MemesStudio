#!/usr/bin/env bash
set -e

echo "🚀 Installing MemesStudio..."

INSTALL_DIR="${HOME}/MemesStudio"

if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation at $INSTALL_DIR..."
  cd "$INSTALL_DIR" && git pull origin main
else
  echo "Cloning MemesStudio to $INSTALL_DIR..."
  git clone https://github.com/sagarku03/MemesStudio.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

chmod +x setup.sh setup.mjs mcp-server.mjs 2>/dev/null || true
./setup.sh
