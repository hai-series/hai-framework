FROM docker.io/library/node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
ARG DEBIAN_MIRROR=https://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://deb.debian.org/debian-security
ARG HAI_AGENT_PACKAGES=
# 基础运行环境与构建阶段选定的变体依赖。
# 使用 Node 自带的公开 CA 引导 HTTPS，随后安装系统 CA；不关闭证书校验。
RUN mkdir -p /etc/ssl/certs && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))"
# 使用发行版的 bwrap 路径，使宿主的 AppArmor profile 能应用于容器内原生沙箱。
RUN set -efu; packages="git ca-certificates bubblewrap"; \
    sed -i -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update; apt-get install -y --no-install-recommends $packages $HAI_AGENT_PACKAGES; \
    rm -rf /var/lib/apt/lists/*; git --version; node --version
# ACP 适配器和原生 Codex CLI 都是镜像的明确组成部分，版本需匹配。
RUN npm install --global @agentclientprotocol/codex-acp@2.5.0 @openai/codex@0.165.0 \
    && codex --version && codex-acp --version
RUN mkdir -p /workspace /state && chown node:node /workspace /state
USER node
ENV HOME=/state
WORKDIR /workspace
ENTRYPOINT ["codex-acp"]
CMD []
