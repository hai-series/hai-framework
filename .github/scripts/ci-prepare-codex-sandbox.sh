#!/bin/sh
# 仅为一次性 Linux runner 准备原生沙箱，不关闭全局 AppArmor 限制。
set -eu
install_sandbox_packages() {
  apt-get "$@" -o APT::Update::Error-Mode=any update &&
    DEBIAN_FRONTEND=noninteractive apt-get "$@" install -y --no-install-recommends bubblewrap apparmor-profiles apparmor-utils
}

set -- -o Acquire::Retries=1 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20
ubuntu_sources=/etc/apt/sources.list.d/ubuntu.sources
if [ -r "$ubuntu_sources" ]; then
  # 替换 Ubuntu 源的 URIs 字段，避免 mirror+file 继续选择不可用镜像。
  sources=$(mktemp --suffix=.sources)
  trap 'rm -f "$sources"' EXIT
  chmod 0644 "$sources"
  set -- "$@" -o "Dir::Etc::sourcelist=$sources" -o Dir::Etc::sourceparts=-
  suite=$(awk '$1=="Suites:" {print $2; exit}' "$ubuntu_sources")
  test -n "$suite"
  installed=false
  for archive in https://archive.ubuntu.com/ubuntu https://mirrors.edge.kernel.org/ubuntu https://mirror.math.princeton.edu/pub/ubuntu; do
    if ! curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 6 --max-time 12 --output /dev/null "$archive/dists/$suite/InRelease"; then
      continue
    fi
    sed "s|^URIs:.*$|URIs: $archive|" "$ubuntu_sources" > "$sources"
    printf 'Preparing sandbox packages from %s\n' "$archive"
    if install_sandbox_packages "$@"; then
      installed=true
      break
    fi
  done
  if [ "$installed" = false ]; then
    printf 'Could not install the Ubuntu packages required for sandbox validation.\n' >&2
    exit 1
  fi
else
  install_sandbox_packages "$@"
fi
profile=/etc/apparmor.d/bwrap-userns-restrict
extra=/usr/share/apparmor/extra-profiles/bwrap-userns-restrict
if [ -f "$extra" ]; then
  install -m 0644 "$extra" "$profile"
fi
test -f "$profile"
apparmor_parser -r "$profile"
bwrap --version
