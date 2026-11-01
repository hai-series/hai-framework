FROM docker.io/library/node:24.22.1-bookworm-slim
ARG DEBIAN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian-security
ARG WITH_JAVA=false
ARG WITH_RUST=false
ARG WITH_GO=false
ARG GOOSE_DOWNLOAD_URL=https://github.com/aaif-goose/goose/releases/download/v1.57.0/goose-x86_64-unknown-linux-musl.tar.gz
# Git/Node/Python 为基础环境，Goose 使用固定版本及固定 SHA256 的官方 musl 二进制。
RUN mkdir -p /etc/ssl/certs && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))"
RUN set -eu; packages="git python3 python3-venv python3-pip ca-certificates curl musl"; \
    case "$WITH_JAVA" in true) packages="$packages default-jdk-headless";; false) ;; *) exit 2;; esac; \
    case "$WITH_RUST" in true) packages="$packages rustc cargo";; false) ;; *) exit 2;; esac; \
    case "$WITH_GO" in true) packages="$packages golang";; false) ;; *) exit 2;; esac; \
    sed -i -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update; \
    apt-get install -y --no-install-recommends $packages; rm -rf /var/lib/apt/lists/*; \
    git --version; node --version; python3 --version
RUN test "$(uname -m)" = x86_64 && \
    curl --fail --location --retry 2 --connect-timeout 30 --max-time 300 \
      "${GOOSE_DOWNLOAD_URL}" \
      --output /tmp/goose.tar.gz && \
    echo '6c3a05e30e1a425dc06a410dbe24b3f3697c9721b1ea2340434ddda6b64267ae  /tmp/goose.tar.gz' | sha256sum --check - && \
    mkdir /tmp/goose-install && tar -xf /tmp/goose.tar.gz -C /tmp/goose-install && \
    install -m 0755 /tmp/goose-install/goose /usr/local/bin/goose && \
    rm -rf /tmp/goose.tar.gz /tmp/goose-install && goose --version
RUN mkdir -p /workspace /state/.config/goose && \
    echo '{"extensions":{"developer":{"bundled":true,"enabled":true,"name":"developer","timeout":300,"type":"builtin"}}}' > /state/.config/goose/config.yaml && \
    chown -R node:node /workspace /state
USER node
ENV HOME=/state
WORKDIR /workspace
EXPOSE 3284
ENTRYPOINT ["goose"]
CMD ["serve", "--host", "0.0.0.0", "--port", "3284"]
