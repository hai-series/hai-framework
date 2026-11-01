#!/bin/sh
# 仅为一次性 Linux runner 准备原生沙箱，不关闭全局 AppArmor 限制。
set -eu
apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends bubblewrap apparmor-profiles apparmor-utils
profile=/etc/apparmor.d/bwrap-userns-restrict
extra=/usr/share/apparmor/extra-profiles/bwrap-userns-restrict
if [ -f "$extra" ]; then
  install -m 0644 "$extra" "$profile"
fi
test -f "$profile"
apparmor_parser -r "$profile"
bwrap --version
