# JDK 21、Android SDK 36 和 Build Tools 36.0.0 由 Cirrus Labs 基础镜像提供。
ARG HAI_ANDROID_IMAGE=ghcr.io/cirruslabs/android-sdk:36@sha256:d9c965f2373f9c8cc023b207cdcc7d21508f98e6a45ab66462fe41aa9f866dea
FROM ${HAI_ANDROID_IMAGE}

ARG HAI_NPM_REGISTRY=https://registry.npmjs.org
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

# 构建机使用 linux/amd64，APK 内的目标 ABI 由应用的 Gradle 配置决定。
RUN test "$(uname -m)" = x86_64 \
    && curl --fail --silent --show-error --location --retry 3 --max-time 120 \
      https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-x64.tar.gz -o /tmp/node.tar.gz \
    && echo 'eb6728e77c576a35162c122c45ccadf224d89ff00abc8dae46cc2897c6002d7c  /tmp/node.tar.gz' | sha256sum --check \
    && tar -xzf /tmp/node.tar.gz --strip-components=1 -C /usr/local \
    && rm /tmp/node.tar.gz \
    && npm install --global --registry "$HAI_NPM_REGISTRY" --no-audit --no-fund --include=optional pnpm@12.11.2 \
    && test "$(pnpm --version)" = 12.11.2 \
    && npm cache clean --force

# Capacitor 插件可能由 AGP 选择默认的 Build Tools 35.0.0。
ARG HAI_ANDROID_BUILD_TOOLS_35_URL=https://dl.google.com/android/repository/build-tools_r35_linux.zip
RUN mkdir /tmp/android-tools35 \
    && curl --fail --silent --show-error --location --retry 3 --retry-all-errors --connect-timeout 20 \
      "$HAI_ANDROID_BUILD_TOOLS_35_URL" -o /tmp/android-tools35/tools.zip \
    && echo 'bd3a4966912eb8b30ed0d00b0cda6b6543b949d5ffe00bea54c04c81e1561d88  /tmp/android-tools35/tools.zip' | sha256sum --check \
    && unzip -q /tmp/android-tools35/tools.zip -d /tmp/android-tools35 \
    && mv /tmp/android-tools35/android-15 "$ANDROID_HOME/build-tools/35.0.0" \
    && test -x "$ANDROID_HOME/build-tools/35.0.0/aapt2" \
    && rm /tmp/android-tools35/tools.zip \
    && rmdir /tmp/android-tools35

WORKDIR /workspace
