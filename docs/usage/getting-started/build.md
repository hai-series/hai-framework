# 编译源码、镜像与原生打包

[首次交付](README.md) · [上一步：开发](develop.md) · [下一步：部署](../operations/deployment.md)

先决定交付什么，再选target。compile编译源码，`image`生成serv/web镜像，app/desktop生成对应原生包；cap:sync只同步资源，不是安装包。

```sh
pnpm build
pnpm build --target image --concurrency 2
pnpm build --target image --images web
pnpm build --target desktop --platform windows --arch x64
pnpm build --target app --platform android
```

命令在生成工程根运行。镜像默认并行两项，资源紧张时设置 `--concurrency 1`。所需参数、`hai.json`完整例子和真实默认值见[构建部署配置](../configuration/delivery.md#配置入口和角色)，避免在不同流程重复维护。

## 核对身份和产物

`package.json.name`是资源身份，`version`是应用版本。制品在.hai/build/docker/<buildId>/，manifest记录版本、构建ID、镜像角色、partial、`hasWeb`和SHA-256。网站挂载目录由构建工具记录；发布到子目录时按[网站子目录配置](../configuration/delivery.md#网站部署在子目录)。相同版本允许重建，由`buildId`与镜像引用区分；只有全部导出成功才推进本机构建入口。

构建不选择生产环境、不注入运行密钥；镜像可跨环境复用。部分镜像制品不等于首次完整安装，部署模式由manifest和所选服务判断。旧格式/旧角色名需要重新构建，不只改文件名。

## 原生和离线条件

原生构建在对应OS准备工具链、平台工程和签名，发布排除开发热更新地址并核对实际新产物。完全离线构建需提前准备基础镜像、依赖和原生预编译包，Windows依赖目录不能代替Linux镜像输入。

交付前检查目标架构、镜像校验和、用户流程与持久数据；原生需真实设备验收。准备好制品后进入[发布运行章节](../operations/README.md)。
