#!/usr/bin/env bash
# Обёртка ежедневного задания проверки хеш-цепочки (URS-099 / URS-100).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec pnpm audit:verify
