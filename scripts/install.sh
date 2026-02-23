#!/bin/sh
# TARX CLI Installer
# curl -fsSL https://tarx.com/install | sh
#
# Platform: macOS (arm64, x86_64), Linux (x86_64)
# Idempotent: safe to re-run, skips current versions
# POSIX sh compatible -- no bashisms, no jq

set -e

# -- Defaults --

TARX_VERSION=""
TARX_CHANNEL="${TARX_CHANNEL:-stable}"
TARX_PREFIX=""
TARX_INSTALL_DIR=""
TARX_BIN="tarx"
TARX_BASE_URL="https://tarx.com"

SILENT=false
FORCE=false
PLATFORM=""
ARCH=""
PLATFORM_LLAMA=""

_api_json=""

# -- Parse args --

while [ $# -gt 0 ]; do
	case "$1" in
		--silent|-s)   SILENT=true ;;
		--force|-f)    FORCE=true ;;
		--channel)     shift; TARX_CHANNEL="${1:-stable}" ;;
		--channel=*)   TARX_CHANNEL="${1#*=}" ;;
		--prefix)      shift; TARX_PREFIX="${1:-}" ;;
		--prefix=*)    TARX_PREFIX="${1#*=}" ;;
		--version)     shift; TARX_VERSION="${1:-}" ;;
		--version=*)   TARX_VERSION="${1#*=}" ;;
		--help|-h)
			cat <<'HELP'
TARX CLI Installer

Usage:	curl -fsSL https://tarx.com/install | sh
	curl -fsSL https://tarx.com/install | sh -s -- [OPTIONS]

Options:
	--silent, -s	No interactive output (CI-friendly)
	--prefix PATH	Custom install directory
	--channel CHANNEL	Release channel: stable (default) or beta
	--version VER	Install specific version (default: latest)
	--force, -f	Re-install even if same version present
	--help, -h	Show this help
HELP
			exit 0
			;;
		*)
			printf 'Unknown option: %s (use --help)\n' "$1" >&2
			exit 1
			;;
	esac
	shift
done

# -- Helpers --

log() {
	if [ "$SILENT" = false ]; then
		printf '%s\n' "$*"
	fi
}

warn() { printf 'WARNING: %s\n' "$*" >&2; }
err()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

need_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		err "Required command not found: $1. Install it and retry."
	fi
}

# Extract a JSON string value by key (no jq needed)
json_value() {
	printf '%s' "$2" | sed 's/,/\n/g' | grep "\"$1\"" | head -1 | \
		sed 's/.*"'"$1"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

# Extract a value nested under a parent key
json_nested() {
	printf '%s' "$3" | sed "s/.*\"$1\"//" | sed 's/,/\n/g' | grep "\"$2\"" | head -1 | \
		sed 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

# -- Platform detection --

detect_platform() {
	_os="$(uname -s)"
	_arch="$(uname -m)"

	case "$_os" in
		Darwin) PLATFORM="darwin" ;;
		Linux)  PLATFORM="linux" ;;
		*)      err "Unsupported OS: $_os. TARX supports macOS and Linux." ;;
	esac

	case "$_arch" in
		x86_64|amd64)  ARCH="x64" ;;
		arm64|aarch64) ARCH="arm64" ;;
		*)             err "Unsupported architecture: $_arch" ;;
	esac

	# llama.cpp release asset naming
	case "$_os" in
		Darwin)
			case "$_arch" in
				arm64|aarch64) PLATFORM_LLAMA="macos-arm64" ;;
				*)             PLATFORM_LLAMA="macos-x64" ;;
			esac
			;;
		*)
			PLATFORM_LLAMA="ubuntu-x64"
			;;
	esac

	log "Platform: ${PLATFORM}/${ARCH}"
}

# -- Install directory --

resolve_install_dir() {
	if [ -n "$TARX_PREFIX" ]; then
		TARX_INSTALL_DIR="$TARX_PREFIX"
	else
		TARX_INSTALL_DIR="${HOME}/.tarx/bin"
	fi
	log "Install dir: ${TARX_INSTALL_DIR}"
}

# -- Fetch release metadata --

fetch_metadata() {
	need_cmd curl

	log "Fetching release info..."
	_api_json=$(curl -fsSL "${TARX_BASE_URL}/api/cli/latest" 2>/dev/null) || true

	if [ -z "$_api_json" ]; then
		err "Could not reach ${TARX_BASE_URL}/api/cli/latest -- check network."
	fi

	if [ -z "$TARX_VERSION" ]; then
		TARX_VERSION=$(json_value "version" "$_api_json")
	fi

	if [ -z "$TARX_VERSION" ]; then
		err "Could not determine version."
	fi

	log "Version: ${TARX_VERSION}"
}

# -- Idempotency --

check_existing() {
	if [ "$FORCE" = true ]; then return 1; fi

	if command -v "$TARX_BIN" >/dev/null 2>&1; then
		_installed=$("$TARX_BIN" version 2>/dev/null) || _installed="unknown"
		if [ "$_installed" = "$TARX_VERSION" ] || [ "$_installed" = "${TARX_VERSION#v}" ]; then
			log "TARX ${_installed} already installed. Use --force to reinstall."
			return 0
		fi
		log "Upgrading TARX ${_installed} -> ${TARX_VERSION}"
		return 1
	fi
	return 1
}

# -- Download + verify TARX CLI --

download_tarx_cli() {
	need_cmd curl

	_platform_key="${PLATFORM}-${ARCH}"
	_download_url=$(json_nested "$_platform_key" "url" "$_api_json")
	_expected_sha=$(json_nested "$_platform_key" "sha256" "$_api_json")

	if [ -z "$_download_url" ]; then
		err "No download URL for ${_platform_key}"
	fi

	_tmpdir="$(mktemp -d)"
	# shellcheck disable=SC2064
	trap "rm -rf '$_tmpdir'" EXIT INT TERM

	_dest="${_tmpdir}/tarx"

	log "Downloading tarx CLI..."
	if ! curl -fsSL -o "$_dest" "$_download_url"; then
		err "Download failed from ${_download_url}"
	fi

	if [ -n "$_expected_sha" ]; then
		log "Verifying checksum..."
		if command -v sha256sum >/dev/null 2>&1; then
			_actual=$(sha256sum "$_dest" | awk '{print $1}')
		elif command -v shasum >/dev/null 2>&1; then
			_actual=$(shasum -a 256 "$_dest" | awk '{print $1}')
		else
			warn "No sha256sum -- skipping verification"
			_actual="$_expected_sha"
		fi
		if [ "$_expected_sha" != "$_actual" ]; then
			err "Checksum mismatch! Expected: ${_expected_sha}, Got: ${_actual}"
		fi
		log "Checksum: verified"
	fi

	chmod +x "$_dest"
	TARX_CLI_BINARY="$_dest"
}

# -- Download llama-server --

download_llama_server() {
	# Skip if llama-server already exists
	if command -v llama-server >/dev/null 2>&1; then
		log "llama-server: already installed ($(command -v llama-server))"
		return
	fi
	if [ -x "${TARX_INSTALL_DIR}/llama-server" ]; then
		log "llama-server: already installed (${TARX_INSTALL_DIR}/llama-server)"
		return
	fi

	need_cmd curl

	log "Downloading llama-server (AI runtime)..."

	# Get latest release tag from GitHub API
	_release_json=$(curl -sfL "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest" 2>/dev/null) || true
	if [ -z "$_release_json" ]; then
		warn "Could not fetch llama.cpp releases -- skipping. Install manually: brew install llama.cpp"
		return
	fi

	_tag=$(printf '%s' "$_release_json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
	if [ -z "$_tag" ]; then
		warn "Could not determine llama.cpp version -- skipping."
		return
	fi

	_asset="llama-${_tag}-bin-${PLATFORM_LLAMA}.tar.gz"
	_url="https://github.com/ggml-org/llama.cpp/releases/download/${_tag}/${_asset}"

	log "  Version: ${_tag}"
	log "  Asset: ${_asset}"

	_tmpdir2="$(mktemp -d)"

	if ! curl -fSL --progress-bar -o "${_tmpdir2}/${_asset}" "$_url" 2>/dev/null; then
		warn "llama-server download failed -- install manually: brew install llama.cpp"
		rm -rf "$_tmpdir2"
		return
	fi

	# Extract
	tar -xzf "${_tmpdir2}/${_asset}" -C "$_tmpdir2" 2>/dev/null || {
		warn "Failed to extract llama-server archive"
		rm -rf "$_tmpdir2"
		return
	}

	# Find the llama-server binary
	_llama_bin="$(find "$_tmpdir2" -name "llama-server" -type f | head -1)"
	if [ -z "$_llama_bin" ]; then
		warn "llama-server binary not found in archive"
		rm -rf "$_tmpdir2"
		return
	fi

	cp "$_llama_bin" "${TARX_INSTALL_DIR}/llama-server"
	chmod +x "${TARX_INSTALL_DIR}/llama-server"
	rm -rf "$_tmpdir2"

	log "  Installed: ${TARX_INSTALL_DIR}/llama-server"
}

# -- Install --

install_binaries() {
	if [ ! -d "$TARX_INSTALL_DIR" ]; then
		mkdir -p "$TARX_INSTALL_DIR" 2>/dev/null || {
			sudo mkdir -p "$TARX_INSTALL_DIR"
			sudo chown "$(id -u):$(id -g)" "$TARX_INSTALL_DIR"
		}
	fi

	_dest="${TARX_INSTALL_DIR}/${TARX_BIN}"

	if [ -w "$TARX_INSTALL_DIR" ]; then
		cp "$TARX_CLI_BINARY" "$_dest"
		chmod +x "$_dest"
	else
		log "Need elevated permissions for ${TARX_INSTALL_DIR}"
		sudo cp "$TARX_CLI_BINARY" "$_dest"
		sudo chmod +x "$_dest"
	fi

	log "Installed: ${_dest}"

	# Download llama-server (non-blocking -- warns on failure)
	download_llama_server

	# Add to PATH if not already there
	if [ "$TARX_INSTALL_DIR" = "${HOME}/.tarx/bin" ]; then
		_rc=""
		case "${SHELL:-/bin/sh}" in
			*/zsh)  _rc="${HOME}/.zshrc" ;;
			*/bash) _rc="${HOME}/.bashrc" ;;
			*/fish) _rc="${HOME}/.config/fish/config.fish" ;;
			*)      _rc="${HOME}/.profile" ;;
		esac
		if [ -n "$_rc" ] && ! grep -qF '.tarx/bin' "$_rc" 2>/dev/null; then
			# shellcheck disable=SC2016
			printf '\n# TARX CLI\nexport PATH="${HOME}/.tarx/bin:${PATH}"\n' >> "$_rc"
			log "Added to PATH in ${_rc}"
		fi
	fi
}

# -- Main --

main() {
	log ""
	log "TARX CLI Installer"
	log "=================="
	log ""

	need_cmd curl
	detect_platform
	resolve_install_dir
	fetch_metadata

	if check_existing; then exit 0; fi

	download_tarx_cli
	install_binaries

	log ""
	log "TARX ${TARX_VERSION} installed."
	log ""
	log "Run 'tarx start' to begin (~4.4 GB model download on first run)."
	log "Then: tarx chat \"hello\""
	log ""
	log "  tarx start       Download models + start services"
	log "  tarx status      Check service health"
	log "  tarx doctor      Diagnose issues"
	log ""

	# Hint about PATH if not in current session
	if ! command -v tarx >/dev/null 2>&1; then
		log "Restart your shell or run:"
		# shellcheck disable=SC2016
		log '  export PATH="${HOME}/.tarx/bin:${PATH}"'
		log ""
	fi
}

main
