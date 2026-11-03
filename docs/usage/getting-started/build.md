# 编译源码、镜像与原生打包

[首次交付](README.md) · [上一步：开发](develop.md) · [下一步：部署](../operations/deployment.md)

先决定交付什么，再选target。compile编译源码，`image`生成serv/web镜像，app/desktop生成对应原生包；cap:sync只同步资源，不是安装包。

```sh
pnpm build
pnpm build --target image --concurrency 2
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
pnpm build --target app --platform android --runtime auto --debug
pnpm build --target app --platform android --runtime auto
```

命令在生成工程根运行。镜像默认并行两项，资源紧张时设置 `--concurrency 1`。所需参数、`hai.json`完整例子和真实默认值见[构建部署配置](../configuration/delivery.md#配置入口和角色)，避免在不同流程重复维护。

下载慢时可加 `--image-source cn --npm-source cn`；需要代理时选择 `--proxy-mode inherit|system|custom|none`。首次交互选择保存为项目默认，`--yes` 复用已保存值。自定义源、代理地址及引擎侧设置见[下载源和代理](../configuration/delivery.md#下载源和代理)。

## 核对身份和产物

`package.json.name`是资源身份，`version`是应用版本。制品在.hai/build/docker/<buildId>/，manifest记录版本、构建ID、镜像角色、partial、`hasWeb`和SHA-256。网站挂载目录由构建工具记录；发布到子目录时按[网站子目录配置](../configuration/delivery.md#网站部署在子目录)。相同版本允许重建，由`buildId`与镜像引用区分；只有全部导出成功才推进本机构建入口。

构建不选择生产环境、不注入运行密钥；镜像可跨环境复用。部分镜像制品不等于首次完整安装，部署模式由manifest和所选服务判断。旧格式/旧角色名需要重新构建，不只改文件名。

## 原生和离线条件

Android 指定 `--runtime auto|docker|podman` 后在容器内准备依赖、编译并打包。首次调试构建可在工作副本生成 Android 壳，发布需要项目已有的原生工程。设置 `HAI_ANDROID_KEYSTORE`（密钥库路径）、`HAI_ANDROID_STORE_PASSWORD`、`HAI_ANDROID_KEY_ALIAS` 和 `HAI_ANDROID_KEY_PASSWORD` 后执行发布命令，密码从构建进程或 CI 注入。iOS 在 macOS/Xcode 上签名导出 IPA，桌面在对应系统调用 Tauri。

原生包默认 release，加 `--debug` 选择调试构建。产物归档在 `.hai/build/app/<android|ios>/<debug|release>/<buildId>/` 或 `.hai/build/desktop/<windows|macos|linux>/<debug|release>/<buildId>/`。每种构建类型各有 `latest`，成功后打印新产物路径。完全离线构建需提前准备基础镜像与依赖缓存。

交付前检查目标架构、镜像校验和、用户流程与持久数据；原生需真实设备验收。准备好制品后进入[发布运行章节](../operations/README.md)。
