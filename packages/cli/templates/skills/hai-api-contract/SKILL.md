---
name: hai-api-contract
description: "声明共享 HTTP 操作、组合领域契约、读取业务路径，并接入 Serv、Kit 或 API Client。"
---

# hai-api-contract

## 能力契约

| 项目 | 契约 |
| --- | --- |
| 能力 | 使用 @h-ai/api-contract 定义、组合和扩展共享 HTTP contract 与 Zod 输入输出 |
| 适用场景 | 新增/修改共享接口定义，不负责实现 handler |
| 输入 | 领域路径、schema、HTTP 方法、共享错误模型 |
| 输出 | 供 Serv 装配、Kit 复用 Schema 或 API Client 推导调用的契约 |
| 限制 | 纯定义，无 init/close；不包含服务端实现或密钥。业务路径属于 contract，公共传输配置属于 transport。 |

## 使用路径

新增、修改或删除接口及其输入输出前，先说明对服务端和客户端调用方的影响，并按 [hai-change-plan](../hai-change-plan/SKILL.md) 取得人工确认。

1. 查当前公开 exports 与已有领域 contract，确认业务路径唯一来源。
2. 用 [route](reference.md#declare-routes) 声明单个操作的 HTTP 方法、业务路径和输入输出。只导出跨接口或跨层复用的 Schema。
3. 用 [create](reference.md#compose-domains) 组合应用领域。条件值使用 `satisfies CreateApiContractOptions` 保留具名可选类型。用 [pathOf](reference.md#read-route-path) 从已声明的单个操作节点读取路径。
4. 按宿主同步 [Serv 操作实现](reference.md#use-with-serv)或 [Kit 文件路由](reference.md#use-with-kit)，再核对 [typed client](reference.md#use-with-client) 的传入契约与校验结果。普通业务输出使用 HaiResult。
5. 独立 contract 包实际执行声明构建。推导需要的上游公共类型 `ContractProcedureBuilderWithInputOutput`、`ContractProcedureBuilderWithOutput`、`Schema` 已由本包转出；显式类型从公开入口 `import type`，不引用依赖内部路径。

## 按需参考

按本次操作读取对应小节；以已安装版本的公开类型核验签名，示例中的业务变量由应用提供。

- [运行环境](reference.md#运行环境)
- [适用场景](reference.md#适用场景)
- [使用步骤](reference.md#使用步骤)
- [核心 API](reference.md#核心-api)
- [Contract 定义规范](reference.md#contract-定义规范)
- [常见模式](reference.md#常见模式)
- [测试](reference.md#测试)
