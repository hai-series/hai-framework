# 管理台自动化测试

本目录只用于测试，不参与管理台运行。正常启动使用应用根目录的环境文件和 `pnpm dev`。

`pnpm test:e2e` 执行界面用例，并覆盖以下独立测试场景：

- 根目录的 `playwright.config.ts`：使用实际 `.env.test` 验证加密传输和页面启动。
- `configs/iam-flow.ts`：注册、登录、通知、LDAP 和提示消息。`--ldap` 只启动测试目录服务，需要可用的容器运行时。
- `configs/auth-security.ts`：首次改密、禁止复用密码等认证策略。

`configs/*.env` 只声明对应测试场景的差异。测试期间经正常 dotenv 入口读取，结束后恢复 `.env.test`，不生成替代密钥或覆盖初始密码。

专项场景不能代替默认启动验收。仓库根目录 `pnpm test:startup` 单独执行各应用真实 `pnpm dev`，不注入应用环境变量。
