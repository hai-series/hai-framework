# 支付与原生设备接入

[返回使用指南](../README.md) · [支付与原生配置手册](../configuration/experience.md#支付渠道配置)

支付和原生设备都依赖框架之外的运行环境。先验证本地参数与错误边界，再使用渠道沙箱或目标设备完成实际操作。页面跳转、插件存在和 Mock 返回成功，都不能代替最终结果。

## 支付渠道

用途：创建订单、验证通知、查单与退款。先初始化共享 RelDB，准备渠道测试账号及已登记回调地址；应用负责订单状态、金额/币种、授权与持久去重。当前支持微信 jsapi、支付宝 h5、Stripe h5，不能假设所有渠道支持所有 tradeType。

先按[支付渠道配置](../configuration/experience.md#支付渠道配置)注入沙箱凭据、回调和信任密钥。该处统一维护完整例子、必填项、默认容差和渠道差异；Schema检查不发送支付请求。微信按平台serial选验签密钥，支付宝核对sellerId/app，Stripe区分test/live和通知密钥。完整方法见[Payment](../../../packages/payment/README.md)。

操作：创建测试订单 → 客户端调用渠道 → 服务端验证通知 → 在应用事务内按 eventId 去重、订单 CAS 和 outbox 发布履约 → 查询订单状态。前端跳转成功或 HTTP 200 不等于已付款；Stripe completed/unpaid 仍为 pending，refund processing 要等待渠道确认。外部履约使用稳定幂等键；unknown 先核对渠道，不能无限重试。

确认时，先验证签名和商户边界，再核对业务订单金额与状态。当前运行了支付通知安全测试：使用真实签名/加解密与受控请求夹具，覆盖有效通知、错误签名、错误商户和时间边界等 38 个场景。下面是该测试文件实际运行结果，未发起外部交易：

![支付通知安全测试的实际结果](../images/payment-notification-checks.png)

接入自己的支付渠道后，还要在沙箱覆盖金额不匹配、重复/乱序通知和处理中退款，核对服务端订单与渠道记录。本轮没有真实支付、退款或渠道沙箱验收，测试通过不能证明真实商户配置已经可用。

## Capacitor 与桌面应用

用途：设备信息、相机、推送与安全 TokenStorage。`capacitor.init()` 无配置参数，检测原生宿主；Web 与 Android/iOS 能力不同。相机、推送等通过每次调用的公开选项控制，没有统一的 `_capacitor.yml` 或约定环境变量。

```ts
import { capacitor } from '@h-ai/capacitor'

const ready = await capacitor.init()
if (!ready.success) throw new Error(ready.error.message)
try {
  const device = await capacitor.device.getInfo()
  if (!device.success) throw new Error(device.error.message)
  // 将明确允许的设备信息传给业务；不要将其当作可信认证身份。
}
finally {
  const closed = await capacitor.close()
  if (!closed.success) throw new Error(closed.error.message)
}
```

前置：安装目标平台 SDK/插件、配置权限和签名，再用生成项目的 app 构建入口打包。`CAPACITOR_SERVER_URL` 只用于开发热更新，发布包不保留开发服务地址。桌面 Tauri 的权限与本地资源另按目标平台配置，不以 Capacitor 浏览器能力替代。

影响与确认：权限被拒、设备不可用、取消及存储故障应有明确结果；原生 TokenStorage 失败拒绝 Promise，不能静默换成不安全存储。push 设置阶段超时为30秒，close/cleanup 返回 HaiResult，清理失败保留待重试句柄。实际签名、安装、启动、推送和安全存储必须在设备上验收。本轮未执行原生构建或安装；浏览器预览和类型检查不代表原生已通过。
