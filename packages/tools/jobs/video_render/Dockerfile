FROM docker.io/library/node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
RUN mkdir -p /etc/ssl/certs && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))"
ARG DEBIAN_MIRROR=https://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://deb.debian.org/debian-security
RUN set -eu; \
    sed -i -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=20 update; \
    apt-get install -y --no-install-recommends python3 chromium ffmpeg fonts-liberation fonts-noto-cjk; \
    rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/hai-tools /input /output && chown 1000:1000 /output
COPY tool.py /usr/local/bin/hai-tool
COPY media_files.py hyperframes-runtime.mjs /opt/hai-tools/
COPY video_render /opt/hai-tools/video_render
RUN printf 'from video_render.operation import commands\n' > /opt/hai-tools/operation.py
RUN npm install --prefix /opt/hai-tools --save-exact --no-audit --no-fund hyperframes@0.9.56
RUN chmod 0555 /usr/local/bin/hai-tool
USER 1000:1000
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/hai-tool"]
