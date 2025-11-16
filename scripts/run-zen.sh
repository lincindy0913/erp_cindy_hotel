#!/bin/bash
set -euo pipefail

CONFIG_FILE="$HOME/.cursor/mcp.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "🚫 無法找到 jq，請先安裝 jq 後再試一次" >&2
  exit 1
fi

get_env_value() {
  local key="$1"
  jq -r --arg key "$key" '.mcpServers.zen.env[$key] // empty' "$CONFIG_FILE"
}

# 如果在 mcp.json 有設定 PATH，就先套用
PATH_OVERRIDE="$(get_env_value "PATH")"
if [ -n "$PATH_OVERRIDE" ]; then
  export PATH="$PATH_OVERRIDE"
fi

# 需要的 API key 名稱
REQUIRED_KEYS=(
  "OPENAI_API_KEY"
  "ANTHROPIC_API_KEY"
  "GEMINI_API_KEY"
  "OLLAMA_BASE_URL"
  "OLLAMA_MODEL"
)

for key in "${REQUIRED_KEYS[@]}"; do
  if [ -z "${!key:-}" ]; then
    value="$(get_env_value "$key")"
    if [ -n "$value" ]; then
      export "$key"="$value"
    fi
  fi
done

if [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${GEMINI_API_KEY:-}" ] && [ -z "${OLLAMA_BASE_URL:-}" ]; then
  cat >&2 <<'EOF'
🚫 找不到可用的 API key。
請在當前 shell 匯入至少一組（例如 OPENAI_API_KEY 或 GEMINI_API_KEY），
或在 ~/.cursor/mcp.json 的 zen.env 區段填入對應的金鑰。
EOF
  exit 1
fi

# 尋找可用的 uvx 執行檔
for p in $(command -v uvx 2>/dev/null) "$HOME/.local/bin/uvx" /opt/homebrew/bin/uvx /usr/local/bin/uvx uvx; do
  if [ -x "$p" ]; then
    exec "$p" --from git+https://github.com/BeehiveInnovations/zen-mcp-server.git zen-mcp-server
  fi
done

echo "uvx not found" >&2
exit 1

