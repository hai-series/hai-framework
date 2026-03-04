# hai Android App

基于 Capacitor + SvelteKit SPA 的 Android 原生应用示例。

## 开发

```bash
# 启动开发服务器
pnpm dev

# 构建
pnpm build

# 同步到 Android 项目
pnpm cap:sync

# 打开 Android Studio
pnpm cap:android

# 在设备/模拟器运行
pnpm cap:run:android
```

## 环境变量

| 变量            | 说明             | 开发默认值           |
| --------------- | ---------------- | -------------------- |
| PUBLIC_API_BASE | API 服务基础 URL | http://10.0.2.2:3000 |
