# 支付与原生工程配置

[配置手册](README.md) · [页面操作指南](../development/ui.md) · [支付/原生接入](../development/integrations.md)

本页说明 `config/_payment.yml`、`capacitor.config.ts` 和原生工程中的设置。页面布局、主题、语言和 Toast 参数见 [UI 功能说明](../function/ui.md#call-options)。`PUBLIC_` 和 `VITE_` 变量可被前端读取，只放 API 地址等可以公开的信息。

## 支付渠道配置

把渠道参数写入 `config/_payment.yml`。启用 Stripe 时，先用 `reldb.init()` 让各服务连接同一个数据库，再调用 `payment.init()`。当前微信使用 JSAPI、支付宝使用 H5、Stripe 使用托管付款页面。

渠道字段、默认值和验签必填项见 [Payment 配置清单](payment.md#配置清单)。轮换微信平台证书或公钥时，在所有节点保留受信的新旧标识，供同步响应和通知验签。支付宝返回页和 Stripe 取消页负责导航；订单状态由签名核验后按商户、订单及金额确认。

```yaml schema=@h-ai/payment:PaymentConfigSchema
stripe:
  secretKey: ${STRIPE_SECRET_KEY}
  webhookSecret: ${STRIPE_WEBHOOK_SECRET}
  successUrl: https://shop.example.invalid/payment/success
  cancelUrl: https://shop.example.invalid/payment/cancel
  webhookToleranceSeconds: 300
```

先用授权沙箱验证创建、通知、重复通知和未知结果恢复。共享幂等记录、服务端订单终态和金额核对才是业务依据，HTTP200或前端跳转都不够。

微信 JSAPI 的输入配置包含商户身份、签名私钥和受信平台公钥映射：

```yaml schema=@h-ai/payment:PaymentConfigSchema
wechat:
  mchId: example-merchant
  appId: example-app
  apiV3Key: ${WECHAT_API_V3_KEY}
  serialNo: example-merchant-certificate-serial
  privateKey: ${WECHAT_MERCHANT_PRIVATE_KEY}
  platformKeys:
    example-trusted-platform-serial: ${WECHAT_PLATFORM_PUBLIC_KEY}
```

占位值必须替换为支付平台已登记的真实值。API v3 密钥须为 32 位 ASCII 字母或数字，私钥/公钥变量保存完整 PEM 内容。有效支付创建应返回对应渠道的客户端支付参数；验签时只按配置的 `platformKeys` 标识选键。未登记标识、错误签名或金额不符应拒绝，不能从来访通知中接受新公钥。

支付宝 H5 使用自己的身份和 RSA 密钥，不复用微信或 Stripe 凭据：

```yaml schema=@h-ai/payment:PaymentConfigSchema
alipay:
  appId: example-app
  sellerId: example-seller
  privateKey: ${ALIPAY_PRIVATE_KEY}
  alipayPublicKey: ${ALIPAY_PUBLIC_KEY}
  returnUrl: https://shop.example.invalid/payment/result
  signType: RSA2
  sandbox: true
```

输入使用授权沙箱账号。支付宝创建成功后的 `data.clientParams` 是 `{ gateway, fields }` 对象：浏览器向可信的渠道 `gateway` 提交已签名的 `fields` 表单，不把它当成链接或 HTML。`returnUrl` 只是导航，服务端查询或已验签通知才可推进订单状态。生产使用对应账号、密钥及 `sandbox: false`。上线前验证错误商户被拒绝、重复通知只处理一次，而且事务提交后通知端点返回纯文本 `success`。Stripe 的 `data.clientParams.checkoutUrl` 是支付页面地址，也需区分 test/live；`successUrl/cancelUrl` 都不能成为付款事实。

## 原生地址、权限与安全存储

打包手机应用时，Capacitor 读取 `capacitor.config.ts`，相机等功能还要在调用时提供选项。构建目标 `app` 生成 Android 或 iOS 安装包，`desktop` 生成桌面安装包，`web` 生成浏览器页面。

Tauri 开发时未另行设置 API 地址，会使用 `http://localhost:3000/api/v1`；手机上的 `localhost` 指手机自身，Capacitor应明确真实可达地址。浏览器可直接下载 `runtime-config.js`，其中只放 API 地址等可公开的信息。原生`token`使用安全 `TokenStorage`，WebView的`localStorage`不适合敏感凭据。

原生工程还需分别配置应用标识、展示名称、打包 Web 目录、平台权限和签名；将这些值写入 `capacitor.config.ts` 或相应的 Tauri 和平台工程。仅修改 `_core.yml` 中的应用名，不会更改已打包的原生项目。输入一个设备真实可达的公开 API 地址后，应能从真机发出健康请求；相机、推送和安全存储还需分别验证授权允许、拒绝和重启恢复。仅同步资源或生成安装包不会证明设备权限、令牌存储与业务请求正常，完整能力选项见[原生接入](../development/integrations.md)。

原生工程字段见 [Capacitor 配置清单](capacitor.md#配置清单)；相机、状态栏和推送的调用参数见 [Capacitor 功能说明](../function/capacitor.md#call-options)。

`pnpm build --target app --platform android --runtime auto --debug` 在容器内打调试 APK，省略 `--debug` 时使用发布签名。iOS 在 macOS/Xcode 上导出 IPA。`build.app` 指定原生工程，归档位于 `.hai/build/app/<平台>/<构建类型>/<buildId>/`。`CAPACITOR_SERVER_URL` 只用于开发，打包会拒绝同步后的热更新地址。签名见 [原生和离线条件](../getting-started/build.md#原生和离线条件)。

<a id="表单布局与校验"></a>

相关调用说明已移至[功能参考](../function/ui.md#form-layout-guide)。

<a id="toast位置时长和排查信息"></a>

相关调用说明已移至[功能参考](../function/ui.md#toast-options)。

<a id="主题语言和ai内容显示"></a>

相关调用说明已移至[功能参考](../function/ui.md#theme-locale-guide)。
