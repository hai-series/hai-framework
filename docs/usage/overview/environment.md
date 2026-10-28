# 开发、部署和原生环境准备

[认识框架](README.md) · [下一步：创建项目](../getting-started/create.md)

只准备本次任务需要的工具。框架能探测引擎，不会代替安装Podman/Docker、启动虚拟机或准备平台SDK。

## 创建与开发

Node版本需满足`^22.23.4 || ^24.22.1 || ^26.12.1`，pnpm为12.11.2；安装版本以项目engines/packageManager为准。准备Git以及可访问的registry。Windows PowerShell用pnpm.cmd，其他系统按项目命令使用pnpm。

先运行node --version、pnpm --version和hai --version。CLI版本、应用package.json版本和部署构建ID是不同标识，不能互相代替。

## 浏览器验收

按项目Playwright配置安装浏览器，准备实际需要的数据库、缓存、LDAP和其他夹具。测试runner创建隔离数据和证据，失败后保留脱敏日志。缺前置或跳过用例不能称通过；只检查不依赖LDAP的局部UI时，可按验证说明关闭无关前置。

## 容器与Linux部署

构建机需已安装并运行的Podman/Docker；Windows使用Linux容器。完全离线构建还需基础镜像、pnpm依赖缓存和匹配ABI/架构/libc的原生预编译包，Windows node_modules不能替代Linux依赖。

操作机自动上传需tar/ssh/scp；Linux/macOS入口另需sh/awk，Windows需PowerShell5+与OpenSSH。目标Linux需容器引擎、支持--pull never的Compose、sh/tar/sha256sum/awk/curl/util-linux flock、支持flock的文件系统及目录/容器权限。普通离线部署不要求目标Node/pnpm，受控凭据导入是另需Node的独立功能。

生产HTTPS、证书、DNS、端口、防火墙、共享服务、备份和维护窗口仍由团队准备。更详细条件见[部署手册](../configuration/delivery.md)。

## 原生安装包

Android准备平台工程、SDK/JDK与签名，iOS准备macOS/Xcode与签名，Desktop准备目标OS的Rust/Tauri工具链和系统SDK。cap:sync只是同步资源，不能代替生成新安装包；Web预览不等于设备权限、安全存储与推送已验收。
