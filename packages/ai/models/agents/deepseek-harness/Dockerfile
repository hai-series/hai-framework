FROM docker.io/library/node:24.22.1-bookworm-slim
ARG DEBIAN_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.tuna.tsinghua.edu.cn/debian-security
ARG WITH_JAVA=false
ARG WITH_RUST=false
ARG WITH_GO=false
# 基础运行环境；可选语言在构建时选择，不在任务执行时临时安装。
# 使用 Node 自带的公开 CA 引导 HTTPS，随后安装系统 CA；不关闭证书校验。
RUN mkdir -p /etc/ssl/certs && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))"
RUN set -eu; packages="git python3 python3-venv python3-pip ca-certificates"; \
    case "$WITH_JAVA" in true) packages="$packages default-jdk-headless";; false) ;; *) exit 2;; esac; \
    case "$WITH_RUST" in true) packages="$packages rustc cargo";; false) ;; *) exit 2;; esac; \
    case "$WITH_GO" in true) packages="$packages golang";; false) ;; *) exit 2;; esac; \
    sed -i -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update; apt-get install -y --no-install-recommends $packages; \
    rm -rf /var/lib/apt/lists/*; git --version; node --version; python3 --version
RUN npm install --global @deepseek-ai/dsh@0.2.1-rc.5
RUN mkdir -p /workspace /state && chown node:node /workspace /state
USER node
ENV HOME=/state
WORKDIR /workspace
ENTRYPOINT ["dsh"]
CMD ["--profile", "acp"]
