#!/usr/bin/env bash
# Seafood Confidential — developer tool bootstrap for Linux x86_64 (Debian/Ubuntu-like hosts,
# including Claude Code cloud containers and GitHub-hosted runners).
#
# Installs pinned, checksum-verified command-line tools that this repository uses or plans to use.
# Every download is verified against a SHA-256 pinned below; upstream checksum files were
# cross-checked when each pin was recorded (see docs/DEVELOPMENT_ENVIRONMENT.md).
# Idempotent: a tool already present at its pinned version is skipped.
#
# Usage:
#   bash tools/bootstrap/install-dev-tools.sh            # binaries + Node LTS side-by-side + global CLIs
#   bash tools/bootstrap/install-dev-tools.sh --binaries # actionlint, gitleaks, shellcheck only
#   bash tools/bootstrap/install-dev-tools.sh --node     # Node.js LTS side-by-side only
#   bash tools/bootstrap/install-dev-tools.sh --clis     # firebase-tools, vercel, gscan (npm global) only
#   bash tools/bootstrap/install-dev-tools.sh --check    # report installed versions; change nothing
#
# Environment overrides: PREFIX (default /usr/local), NODE_LTS_DIR (default /opt/node24),
# BOOTSTRAP_CACHE (default ~/.cache/seafood-confidential-bootstrap).
set -euo pipefail

# ---- Pins (recorded 2026-11-18; bump deliberately and re-verify) ---------------------------------
# Node 24 "Krypton" (Maintenance LTS, EOL 2028-04-30) rather than 26: Ghost 6.78 requires
# ^22.23.5 || ^24.22.3 and gscan 6.7 requires ^22.17 || ^24 (npm engines, checked 2026-11-18).
NODE_LTS_VERSION="24.22.3"
NODE_LTS_SHA256="4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb"
ACTIONLINT_VERSION="1.7.12"
ACTIONLINT_SHA256="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
GITLEAKS_VERSION="8.30.1"
GITLEAKS_SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
SHELLCHECK_VERSION="0.11.0"  # upstream publishes no checksum file: hash pinned on first use
SHELLCHECK_SHA256="8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198"
FIREBASE_TOOLS_VERSION="15.36.0"
VERCEL_VERSION="66.1.0"
GSCAN_VERSION="6.7.0"

PREFIX="${PREFIX:-/usr/local}"
NODE_LTS_DIR="${NODE_LTS_DIR:-/opt/node24}"
CACHE="${BOOTSTRAP_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/seafood-confidential-bootstrap}"

log()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bootstrap]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[bootstrap]\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Linux" && "$(uname -m)" == "x86_64" ]] || die "Linux x86_64 only; see docs/DEVELOPMENT_ENVIRONMENT.md for other platforms."
command -v curl >/dev/null || die "curl is required"
command -v sha256sum >/dev/null || die "sha256sum is required"

SUDO=""
if [[ "$(id -u)" -ne 0 ]]; then
  if command -v sudo >/dev/null; then SUDO="sudo"; else die "run as root or install sudo"; fi
fi

# fetch <url> <sha256> -> prints cached path after verifying the hash
fetch() {
  local url="$1" sha="$2" file
  file="$CACHE/$(basename "$url")"
  mkdir -p "$CACHE"
  if [[ ! -f "$file" ]] || ! echo "$sha  $file" | sha256sum -c --status -; then
    log "download $(basename "$url")"
    curl -fsSL --retry 4 --retry-delay 2 --max-time 600 -o "$file.part" "$url"
    mv "$file.part" "$file"
  fi
  echo "$sha  $file" | sha256sum -c --status - || { rm -f "$file"; die "checksum mismatch for $(basename "$url")"; }
  printf '%s' "$file"
}

has_version() { # has_version <cmd> <needle>
  command -v "$1" >/dev/null 2>&1 && "$1" --version 2>&1 | grep -qF "$2"
}

install_binaries() {
  local tmp f
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN

  if has_version actionlint "$ACTIONLINT_VERSION"; then log "actionlint $ACTIONLINT_VERSION present"; else
    f="$(fetch "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_amd64.tar.gz" "$ACTIONLINT_SHA256")"
    tar -xzf "$f" -C "$tmp" actionlint && $SUDO install -m 0755 "$tmp/actionlint" "$PREFIX/bin/actionlint"
    log "installed actionlint $ACTIONLINT_VERSION"
  fi

  if has_version gitleaks "$GITLEAKS_VERSION"; then log "gitleaks $GITLEAKS_VERSION present"; else
    f="$(fetch "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" "$GITLEAKS_SHA256")"
    tar -xzf "$f" -C "$tmp" gitleaks && $SUDO install -m 0755 "$tmp/gitleaks" "$PREFIX/bin/gitleaks"
    log "installed gitleaks $GITLEAKS_VERSION"
  fi

  if has_version shellcheck "$SHELLCHECK_VERSION"; then log "shellcheck $SHELLCHECK_VERSION present"; else
    f="$(fetch "https://github.com/koalaman/shellcheck/releases/download/v${SHELLCHECK_VERSION}/shellcheck-v${SHELLCHECK_VERSION}.linux.x86_64.tar.xz" "$SHELLCHECK_SHA256")"
    tar -xJf "$f" -C "$tmp" && $SUDO install -m 0755 "$tmp/shellcheck-v${SHELLCHECK_VERSION}/shellcheck" "$PREFIX/bin/shellcheck"
    log "installed shellcheck $SHELLCHECK_VERSION"
  fi
}

install_node_lts() {
  if [[ -x "$NODE_LTS_DIR/bin/node" ]] && [[ "$("$NODE_LTS_DIR/bin/node" --version)" == "v${NODE_LTS_VERSION}" ]]; then
    log "Node.js v${NODE_LTS_VERSION} present at $NODE_LTS_DIR"; return
  fi
  local f
  f="$(fetch "https://nodejs.org/dist/v${NODE_LTS_VERSION}/node-v${NODE_LTS_VERSION}-linux-x64.tar.xz" "$NODE_LTS_SHA256")"
  $SUDO rm -rf "$NODE_LTS_DIR.new" && $SUDO mkdir -p "$NODE_LTS_DIR.new"
  $SUDO tar -xJf "$f" -C "$NODE_LTS_DIR.new" --strip-components=1
  $SUDO rm -rf "$NODE_LTS_DIR" && $SUDO mv "$NODE_LTS_DIR.new" "$NODE_LTS_DIR"
  log "installed Node.js v${NODE_LTS_VERSION} side-by-side at $NODE_LTS_DIR (system default node unchanged)"
  log "use it with: export PATH=\"$NODE_LTS_DIR/bin:\$PATH\""
}

install_clis() {
  command -v npm >/dev/null || die "npm is required for global CLIs"
  local want=() spec
  for spec in "firebase-tools@${FIREBASE_TOOLS_VERSION}:firebase" "vercel@${VERCEL_VERSION}:vercel" "gscan@${GSCAN_VERSION}:gscan"; do
    local pkg="${spec%%:*}" bin="${spec##*:}" ver="${spec#*@}"; ver="${ver%%:*}"
    if command -v "$bin" >/dev/null 2>&1 && "$bin" --version 2>/dev/null | grep -qF "$ver"; then
      log "$pkg present"
    else
      want+=("$pkg")
    fi
  done
  if ((${#want[@]})); then
    log "npm install -g ${want[*]}"
    $SUDO npm install -g --no-fund --no-audit "${want[@]}"
  fi
}

report() {
  printf '%-12s %s\n' "node" "$(node --version 2>/dev/null || echo missing) (default)"
  printf '%-12s %s\n' "node-lts" "$("$NODE_LTS_DIR/bin/node" --version 2>/dev/null || echo missing) ($NODE_LTS_DIR)"
  printf '%-12s %s\n' "pnpm" "$(pnpm --version 2>/dev/null || echo missing)"
  printf '%-12s %s\n' "shellcheck" "$(shellcheck --version 2>/dev/null | sed -n 's/^version: //p' || echo missing)"
  for c in actionlint gitleaks firebase vercel gscan docker psql glslangValidator; do
    printf '%-12s %s\n' "$c" "$($c --version 2>/dev/null | head -n1 || echo missing)"
  done
}

mode="${1:---all}"
case "$mode" in
  --all)      install_binaries; install_node_lts; install_clis; report ;;
  --binaries) install_binaries ;;
  --node)     install_node_lts ;;
  --clis)     install_clis ;;
  --check)    report ;;
  *) die "unknown option: $mode (see header for usage)" ;;
esac
