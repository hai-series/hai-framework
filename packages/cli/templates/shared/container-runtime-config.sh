#!/bin/sh
set -eu

# 只编码公开白名单；Base64 不会把环境值中的引号或换行解释为 JavaScript。
encode() { printf '%s' "$1" | base64 | tr -d '\n'; }
mkdir -p /tmp/hai-runtime-config
cat > /tmp/hai-runtime-config/runtime-config.js <<EOF
{
  const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value), character => character.charCodeAt(0)));
  const nonempty = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== ''));
  const core = nonempty({
    name: decode('$(encode "${HAI_CORE_NAME:-}")'),
    version: decode('$(encode "${HAI_CORE_VERSION:-}")'),
    env: decode('$(encode "${HAI_CORE_ENV:-}")'),
    defaultLocale: decode('$(encode "${HAI_CORE_DEFAULTLOCALE:-}")')
  });
  const logging = nonempty({
    level: decode('$(encode "${HAI_CORE_LOGGING_LEVEL:-}")'),
    format: decode('$(encode "${HAI_CORE_LOGGING_FORMAT:-}")')
  });
  if (Object.keys(logging).length) core.logging = logging;
  const config = nonempty({
    apiBase: decode('$(encode "${PUBLIC_API_BASE:-}")'),
    apiTransport: decode('$(encode "${PUBLIC_API_TRANSPORT:-}")'),
    apiKeyExchangePath: decode('$(encode "${PUBLIC_API_KEY_EXCHANGE_PATH:-}")')
  });
  if (Object.keys(core).length) config.core = core;
  globalThis.__HAI_PUBLIC_CONFIG__ = { ...globalThis.__HAI_PUBLIC_CONFIG__, ...config };
}
EOF
