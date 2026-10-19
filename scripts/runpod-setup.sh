#!/usr/bin/env bash
# Run inside the chosen Ubuntu/PyTorch Pod after cloning the repository.
# --plan is read-only and can be used before renting a machine.
set -euo pipefail

slowview_repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
slowview_data=/workspace/slow-view-tv-data
slowview_browsers=/workspace/slow-view-tv-browser
slowview_cache=/workspace/slow-view-tv-cache
slowview_node_version=24.22.0

fail() { printf '%s\n' "$*" >&2; exit 1; }
if [[ ${1:-} == --plan ]]; then
  printf '%s\n' \
    'Slow View TV — preparação do piloto, sem alterações:' \
    "Checkout: $slowview_repo" \
    "Dados persistentes: $slowview_data" \
    "Chromium persistente: $slowview_browsers" \
    "Cache npm: $slowview_cache" \
    "Node mínimo: 24; instalação oficial se necessário: $slowview_node_version" \
    'Instalação: apt FFmpeg e dependências gráficas; npm ci; Playwright Chromium; build.' \
    'Aplicativo executado pelo usuário sem privilégios slowview.' \
    'Não cria recursos na nuvem, não inicia o servidor e não altera a senha.'
  exit 0
fi
[[ $# == 0 ]] || fail 'Uso: bash scripts/runpod-setup.sh [--plan]'
[[ $(id -u) == 0 ]] || fail 'Execute a preparação como root no terminal do Pod. Para somente revisar, use --plan.'
[[ -f /etc/os-release ]] || fail 'Sistema Linux não identificado.'
# Only the distribution metadata is sourced; never source application .env files.
source /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 24.04 ]] || fail 'Este instalador foi preparado para a base Ubuntu 24.04 do template escolhido.'
case "$slowview_repo" in /workspace/*) ;; *) fail 'Clone o repositório dentro do volume /workspace antes de instalar.' ;; esac
[[ -f "$slowview_repo/package-lock.json" && -f "$slowview_repo/scripts/runpod-start.mjs" ]] || fail 'Checkout incompleto. Baixe a versão atual do repositório.'
mountpoint -q /workspace || fail '/workspace não é um ponto de montagem. Anexe o volume persistente antes de instalar.'
for slowview_dir in "$slowview_data" "$slowview_browsers" "$slowview_cache"; do
  [[ ! -L "$slowview_dir" ]] || fail "O caminho não pode ser um link simbólico: $slowview_dir"
  [[ "$slowview_dir" != "$slowview_repo" && "$slowview_dir" != "$slowview_repo/"* ]] || fail 'Mantenha dados e caches fora do checkout.'
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
# The NVIDIA vendor library does not supply the generic EGL loader. Chromium's
# install-deps list can omit libegl1; NVIDIA Vulkan may fail to expose
# vkCreateInstance when this loader is absent, even though nvidia-smi works.
apt-get install -y --no-install-recommends ca-certificates curl git xz-utils ffmpeg aria2 util-linux libegl1

if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  case $(uname -m) in x86_64) slowview_arch=x64 ;; aarch64|arm64) slowview_arch=arm64 ;; *) fail 'Arquitetura não suportada por este instalador.' ;; esac
  slowview_download=$(mktemp -d /tmp/slowview-node-XXXXXX)
  trap 'rm -rf -- "$slowview_download"' EXIT
  slowview_archive="node-v${slowview_node_version}-linux-${slowview_arch}.tar.xz"
  slowview_node_url="https://nodejs.org/dist/v${slowview_node_version}"
  curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' "$slowview_node_url/SHASUMS256.txt" -o "$slowview_download/SHASUMS256.txt"
  curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' "$slowview_node_url/$slowview_archive" -o "$slowview_download/$slowview_archive"
  awk -v archive="$slowview_archive" '$2 == archive { print }' "$slowview_download/SHASUMS256.txt" > "$slowview_download/expected.sha256"
  [[ $(wc -l < "$slowview_download/expected.sha256") == 1 ]] || fail 'Manifesto oficial sem checksum único para este pacote Node.'
  (cd "$slowview_download" && sha256sum --check --status expected.sha256) || fail 'Checksum do Node inválido. Nenhum pacote foi extraído.'
  tar -xJf "$slowview_download/$slowview_archive" -C /usr/local --strip-components=1 --no-same-owner
  hash -r
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node.js 24+ não está no PATH.")'

if ! id slowview >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash slowview
fi
[[ $(id -u slowview) != 0 ]] || fail 'O usuário slowview não pode ter UID 0.'
umask 077
mkdir -p "$slowview_data" "$slowview_browsers" "$slowview_cache"
slowview_check_access() {
  runuser -u slowview -- env -u DASHBOARD_PASSWORD -u ADMIN_TOKEN node \
    "$slowview_repo/scripts/runpod-storage-check.mjs" \
    "$slowview_repo" "$slowview_data" "$slowview_browsers" "$slowview_cache"
}
# The RunPod network mount may expose fixed 0:0/777 metadata and reject chown.
# If actual non-root I/O already works, no ownership change is necessary.
if ! slowview_check_access; then
  printf '%s\n' 'Ajustando o proprietário dos diretórios do aplicativo, quando o volume permitir.'
  if ! chown -R slowview:slowview "$slowview_repo" "$slowview_data" "$slowview_browsers" "$slowview_cache" 2>/dev/null; then
    printf '%s\n' 'O volume recusou chown; verificando novamente o acesso efetivo.'
  fi
  slowview_check_access || fail 'O usuário slowview não consegue usar os diretórios. Ajuste o acesso do volume antes de continuar; a aplicação não será executada como root.'
fi
if [[ $(stat -c '%u' "$slowview_data") == $(id -u slowview) ]]; then
  runuser -u slowview -- chmod 700 "$slowview_data" || fail 'Não foi possível restringir o diretório de dados.'
fi
slowview_data_mode=$(stat -c '%a' "$slowview_data")
if (( (8#$slowview_data_mode & 0077) != 0 )); then
  printf '%s\n' 'Este volume não fornece isolamento POSIX privado para os dados. Use o Pod/volume somente para este aplicativo.'
fi
printf '%s\n' 'Leitura, escrita, renomeação e remoção verificadas como slowview.'
export PLAYWRIGHT_BROWSERS_PATH="$slowview_browsers"
cd "$slowview_repo"
# Installation/build processes do not need the dashboard's secret.
runuser -u slowview -- env -u DASHBOARD_PASSWORD -u ADMIN_TOKEN npm ci --include=dev --cache "$slowview_cache" --no-audit --no-fund
node node_modules/playwright/cli.js install-deps chromium
runuser -u slowview -- env -u DASHBOARD_PASSWORD -u ADMIN_TOKEN node node_modules/playwright/cli.js install chromium
runuser -u slowview -- env -u DASHBOARD_PASSWORD -u ADMIN_TOKEN -u VITE_API_BASE_URL npm run build
printf '%s\n' \
  'Preparação concluída. Configure DASHBOARD_PASSWORD como Secret do Pod.' \
  'Execute npm run gpu:check:runpod para inspecionar o driver gráfico.' \
  'Depois execute npm run start:runpod. A preparação não iniciou a aplicação.'
