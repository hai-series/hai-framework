FROM docker.io/library/node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
ARG DEBIAN_MIRROR=https://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://deb.debian.org/debian-security
ARG HAI_AGENT_PACKAGES=
ARG GOOSE_DOWNLOAD_URL=https://github.com/aaif-goose/goose/releases/download/v1.57.0/goose-x86_64-unknown-linux-musl.tar.gz
# Goose 使用固定版本及固定 SHA256 的官方 musl 二进制。
RUN mkdir -p /etc/ssl/certs && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))"
RUN set -efu; packages="git ca-certificates curl musl"; \
    sed -i -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update; \
    apt-get install -y --no-install-recommends $packages $HAI_AGENT_PACKAGES; rm -rf /var/lib/apt/lists/*; \
    git --version; node --version
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
