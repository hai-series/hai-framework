FROM docker.io/library/node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
ARG DEBIAN_MIRROR=https://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://deb.debian.org/debian-security
ARG HAI_AGENT_PACKAGES=
# 基础运行环境与构建阶段选定的变体依赖。
# 使用 Node 自带的公开 CA 引导 HTTPS，随后安装系统 CA；不关闭证书校验。
RUN mkdir -p /etc/ssl/certs && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))"
RUN set -efu; packages="git ca-certificates"; \
    sed -i -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update; apt-get install -y --no-install-recommends $packages $HAI_AGENT_PACKAGES; \
    rm -rf /var/lib/apt/lists/*; git --version; node --version
RUN npm install --global @deepseek-ai/dsh@0.2.1-rc.5
RUN mkdir -p /workspace /state && chown node:node /workspace /state
USER node
ENV HOME=/state
WORKDIR /workspace
ENTRYPOINT ["dsh"]
CMD ["--profile", "acp"]
