FROM docker.io/library/node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS trust
RUN mkdir -p /etc/ssl/certs && node -e "require('node:fs').writeFileSync('/etc/ssl/certs/ca-certificates.crt', require('node:tls').rootCertificates.join('\\n'))"
FROM mcr.microsoft.com/mirror/docker/library/debian:bookworm-slim@sha256:b4aa902587c2e61ce789849cb54c332b0400fe27b1ee33af4669e1f7e7c3e22f
COPY --from=trust /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ARG DEBIAN_MIRROR=https://deb.debian.org/debian
ARG DEBIAN_SECURITY_MIRROR=https://deb.debian.org/debian-security
RUN set -eu; \
    sed -i -e "s|http://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" -e "s|http://deb.debian.org/debian|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    apt-get -o Acquire::Retries=2 -o Acquire::https::Timeout=20 update; \
    apt-get install -y --no-install-recommends python3 python3-uno libreoffice-writer libreoffice-calc libreoffice-impress fonts-liberation fonts-noto-cjk; \
    rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/hai-tools /input /output && chown 1000:1000 /output
COPY tool.py /usr/local/bin/hai-tool
COPY office/operation.py /opt/hai-tools/operation.py
COPY archives.py /opt/hai-tools/archives.py
COPY office/office_job.py /opt/hai-tools/office_job.py
RUN chmod 0555 /usr/local/bin/hai-tool
USER 1000:1000
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/hai-tool"]
