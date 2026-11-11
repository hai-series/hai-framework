#!/bin/sh
# 仅为一次性 Linux runner 准备原生沙箱，不关闭全局 AppArmor 限制。
set -eu
set -- -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30
ubuntu_sources=/etc/apt/sources.list.d/ubuntu.sources
if [ -r "$ubuntu_sources" ]; then
  # 沙箱依赖来自 Ubuntu 官方仓库；沿用 runner 的发行版、组件与签名配置。
  sources=$(mktemp --suffix=.sources)
  trap 'rm -f "$sources"' EXIT
  sed -e 's|http://azure\.archive\.ubuntu\.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
    -e 's|http://security\.ubuntu\.com/ubuntu|https://security.ubuntu.com/ubuntu|g' \
    "$ubuntu_sources" > "$sources"
  chmod 0644 "$sources"
  set -- "$@" -o "Dir::Etc::sourcelist=$sources" -o Dir::Etc::sourceparts=-
fi
apt-get "$@" -o APT::Update::Error-Mode=any update
DEBIAN_FRONTEND=noninteractive apt-get "$@" install -y --no-install-recommends bubblewrap apparmor-profiles apparmor-utils
profile=/etc/apparmor.d/bwrap-userns-restrict
extra=/usr/share/apparmor/extra-profiles/bwrap-userns-restrict
if [ -f "$extra" ]; then
  install -m 0644 "$extra" "$profile"
fi
test -f "$profile"
apparmor_parser -r "$profile"
bwrap --version
