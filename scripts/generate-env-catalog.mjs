/** 从模块公开 Schema 与实际环境变量入口生成统一清单，禁止读取本地凭据文件。 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseEnv } from 'node:util'
import ts from 'typescript'
import { environmentReferenceSource } from './env-reference-source.mjs'

const root = process.cwd()
const modules = [
  ['core', 'core', 'CoreConfigSchema'],
  ['db', 'reldb', 'ReldbConfigSchema'],
  ['cache', 'cache', 'CacheConfigSchema'],
  ['storage', 'storage', 'StorageConfigSchema'],
  ['iam', 'iam', 'IamConfigSchema'],
  ['ai', 'ai', 'AIConfigSchema'],
  ['vecdb', 'vecdb', 'VecdbConfigSchema'],
  ['reach', 'reach', 'ReachConfigSchema'],
  ['payment', 'payment', 'PaymentConfigSchema'],
  ['audit', 'audit', 'AuditInitConfigSchema'],
  ['scheduler', 'scheduler', 'SchedulerConfigSchema'],
  ['deploy', 'deploy', 'DeployConfigSchema'],
  ['serv', 'serv', 'ServConfigSchema'],
  ['kit', 'kit', 'KitConfigSchema'],
]
const variables = new Map()
const explicit = new Map()

/** 补充没有独立 JSDoc 的联合类型标记、动态场景及第三方嵌套字段。 */
function fieldDescription(module, segments) {
  const key = segments.at(-1)
  const field = segments.join('.')
  if (key === 'operationLog')
    return `${module} 操作日志的读写开关、级别与字段截断规则`
  if (module === 'deploy' && field === 'provider')
    return '应用部署目标平台及其连接参数，按 type 选择对应平台字段'
  if (module === 'deploy' && field.startsWith('services')) {
    const service = { db: '关系数据库', cache: '缓存', storage: '对象存储' }[key]
    if (service || field === 'services')
      return `自动开通${service ?? '依赖'}服务的服务商及连接配置`
  }
  if (module === 'payment' && segments.length === 1)
    return `${({ alipay: '支付宝', stripe: 'Stripe', wechat: '微信支付' })[key]}渠道的商户配置与验签参数`
  if (field.includes('operationLog.'))
    return ({ level: '操作日志的输出级别', maxLength: '操作日志字段的最大字符数，0 表示不截断', read: '是否记录读取操作', write: '是否记录写入操作' })[key]
  if (module === 'ai' && field.startsWith('llm.scenarios.'))
    return `场景 ${key} 使用的模型 ID，须与 llm.models 中的 ID 一致`
  if (module === 'deploy') {
    const scope = segments.includes('services') ? `自动开通 ${segments[1]} 服务` : '应用部署'
    const detail = { type: '平台/暴露方式，按所在节点的枚举选择', token: '部署平台访问令牌', apiKey: '服务商 API 密钥', email: '服务商账号邮箱', provisioner: '资源开通服务商', from: '已验证域名的发件邮箱', accessKeyId: '服务商访问密钥 ID', accessKeySecret: '服务商访问密钥 Secret', secretAccessKey: '对象存储访问密钥 Secret', signName: '短信服务审核通过的签名', accountId: 'Cloudflare 账号 ID', apiToken: 'Cloudflare API 令牌' }[key]
    if (detail)
      return `${scope}：${detail}`
  }
  if (module === 'payment') {
    const detail = { alipayPublicKey: '支付宝平台公钥，用于验签', appId: '商户应用 ID', sellerId: '支付宝卖家 ID，通知 seller_id 必须与之匹配', privateKey: '商户签名私钥（PEM）', sandbox: '是否使用沙箱网关', signType: '请求和通知允许的签名算法', secretKey: 'Stripe 服务端密钥', webhookSecret: 'Stripe Webhook 验签密钥', webhookToleranceSeconds: 'Webhook 时间戳允许偏差，单位秒', apiV3Key: '微信支付 API v3 密钥', mchId: '微信支付商户号', platformKeys: '按 Wechatpay-Serial 映射的受信平台证书或公钥 PEM，轮换时保留新旧项', serialNo: '商户 API 证书序列号' }[key]
    if (detail)
      return `${segments[0]}：${detail}`
  }
  if (module === 'iam' && segments[0] === 'ui')
    return ({ brandText: '认证页品牌介绍正文', brandTitle: '认证页品牌区域标题', illustrationUrl: '认证页插图 URL', logoUrl: '认证页品牌 Logo URL', subtitle: '认证面板副标题', title: '认证面板标题', variant: '认证页布局样式' })[key]
  return ({
    type: '后端或功能类型，按枚举选择',
    server: 'HTTP 服务监听地址与端口',
    cors: '跨域访问的来源、请求头与凭据策略',
    http: 'HTTP 基础路径、请求体大小及访问配置',
    provider: '所选后端的连接参数，按 type 选择对应字段',
    providers: '通知 Provider 的连接及投递配置，可按数组索引设置多个渠道',
    templates: '通知模板的名称、渠道与正文格式',
    tags: 'Agent 能力的检索标签',
    operations: '音频模型支持的操作',
    entityTypes: '知识抽取允许的实体类型',
    redact: '日志脱敏字段路径，支持框架日志的路径语法',
    sms: '是否允许短信验证码',
    host: 'HTTP 监听主机名或 IP',
    port: 'HTTP 监听端口',
    apiPrefix: '业务 HTTP API 的基础路径前缀',
    prefix: 'RPC 端点的路径前缀',
    runtime: '本地或远程容器运行时，auto 按部署模块顺序探测',
    transport: '传输加密开关或密钥协商配置',
    keyExchangePath: '客户端与服务端约定的密钥交换端点',
    excludePaths: '不进入传输加密管道的路径',
    path: '当前 HTTP 功能的端点路径',
    readyPath: '服务就绪检查的端点路径',
    allowedHeaders: 'CORS 允许客户端发送的请求头',
    exposedHeaders: 'CORS 允许客户端读取的响应头',
    nativeOrigins: '允许使用原生凭据通道的完整 Origin 列表',
    credentials: '是否允许跨域请求携带凭据',
    origin: 'CORS 允许的 Origin，星号表示任意来源',
    docs: 'HTTP API 文档功能开关或文档访问配置',
    requireAuth: '是否要求认证后访问接口文档',
    health: 'HTTP 健康检查开关或检查配置',
    openapi: 'OpenAPI 端点开关或端点配置',
    rpc: 'RPC 端点开关或访问配置',
    access: 'RPC 对外访问策略',
    gatewayHeader: '受信网关认证请求头名称',
    gatewaySecret: '受信网关认证密钥',
    trustedProxies: '可信代理的 IP/CIDR，只有这些代理的转发头会被信任',
  })[key === '0' ? segments.at(-2) : key]
}

/** 合并不同 Provider 对同一变量的枚举、约束与来源。 */
function add(name, entry) {
  const previous = variables.get(name)
  variables.set(name, previous
    ? { ...previous, enums: [...new Set([...previous.enums, ...entry.enums])], constraints: [...new Set([...previous.constraints, ...entry.constraints])] }
    : { name, ...entry })
}

/** 沿真实 Schema 引用收集字段注释，避免 name/type/apiKey 等同名字段串用说明。 */
function schemaDocumentation(sources, exported) {
  const definitions = new Map()
  for (const [file, text] of sources) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement))
        continue
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer && !definitions.has(declaration.name.text))
          definitions.set(declaration.name.text, declaration.initializer)
      }
    }
  }
  const docs = new Map()
  function visit(node, segments, ancestors = new Set()) {
    if (!node || ancestors.has(node))
      return
    const seen = new Set([...ancestors, node])
    if (ts.isIdentifier(node)) {
      visit(definitions.get(node.text), segments, seen)
    }
    else if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          visit(property.expression, segments, seen)
          continue
        }
        if (!ts.isPropertyAssignment(property))
          continue
        const key = property.name.getText().replace(/^['"]|['"]$/g, '')
        const fieldPath = [...segments, key]
        const leading = property.getSourceFile().text.slice(property.getFullStart(), property.getStart())
        const comment = leading.match(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\//)?.[1]
        if (comment) {
          const description = comment.split('@')[0].replace(/^\s*\*\s?/gm, '').trim().replace(/\s+/g, ' ')
          if (description)
            docs.set(fieldPath.join('.'), description)
        }
        visit(property.initializer, fieldPath, seen)
      }
    }
    else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text
      if (['object', 'strictObject', 'looseObject'].includes(method)) {
        visit(node.arguments[0], segments, seen)
      }
      else if (method === 'array') {
        visit(node.arguments[0], [...segments, '0'], seen)
      }
      else if (method === 'union' || method === 'discriminatedUnion') {
        const branches = node.arguments[method === 'union' ? 0 : 1]
        if (branches && ts.isArrayLiteralExpression(branches)) {
          for (const branch of branches.elements)
            visit(branch, segments, seen)
        }
      }
      else {
        visit(node.expression.expression, segments, seen)
        if (method === 'extend' || method === 'merge')
          visit(node.arguments[0], segments, seen)
      }
    }
  }
  visit(definitions.get(exported), [])
  return docs
}

/** 遍历 Schema 的对象/数组/联合类型；数组 0 表示可重复的任意索引。 */
function walkSchema(node, segments, context, ancestors = new Set(), inheritedDefault) {
  if (!node || typeof node !== 'object')
    return
  if (node.$ref) {
    if (ancestors.has(node.$ref))
      return
    const target = node.$ref.split('/').slice(1).reduce((value, key) => value?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], context.schema)
    walkSchema(target, segments, context, new Set([...ancestors, node.$ref]), inheritedDefault === undefined ? node.default : inheritedDefault)
    return
  }
  // 父对象的显式默认值优先于复用 schema 的字段默认值，例如 AI Knowledge 的 overlap=200。
  const effectiveDefault = inheritedDefault === undefined ? node.default : inheritedDefault
  const name = ['HAI', context.name, ...segments].map(segment => segment.replace(/[^a-z0-9]+/gi, '_').toUpperCase()).join('_')
  const constraints = []
  const enums = node.enum ?? ('const' in node ? [node.const] : [])
  if (node.type)
    constraints.push({ string: '字符串', boolean: 'true | false', number: '数字', integer: '整数', object: 'JSON 对象；整体覆盖时替换该节点', array: 'JSON 数组；索引可按 0、1、2 扩展', null: 'null' }[node.type] ?? String(node.type))
  for (const [key, label] of [['minimum', '>='], ['maximum', '<='], ['exclusiveMinimum', '>'], ['exclusiveMaximum', '<'], ['minLength', '最小字符数'], ['maxLength', '最大字符数'], ['minItems', '最少项数'], ['maxItems', '最多项数'], ['format', '格式'], ['pattern', '正则']]) {
    if (key in node)
      constraints.push(`${label} ${node[key]}`)
  }
  // 同名字段在两个 Provider 的合法范围不同，不能把分支边界合并成同时成立的条件。
  if (context.name === 'db' && segments.join('.') === 'pool.acquireTimeout') {
    constraints.splice(0, constraints.length, '整数；PostgreSQL >=0（0禁用）；MySQL 1–2147483647')
  }
  // apiKey 的 Chroma Bearer 限制只作用于该 Provider，不能将其正则并入 Qdrant 的约束。
  if (context.name === 'vecdb' && segments.join('.') === 'apiKey') {
    constraints.splice(0, constraints.length, '字符串；Qdrant API key；Chroma 为空串或无空白的可打印 ASCII Bearer token')
  }
  if (!constraints.length && !enums.length && effectiveDefault !== undefined) {
    const type = typeof effectiveDefault
    constraints.push(type === 'string' ? '字符串' : type === 'boolean' ? 'true | false' : type === 'number' ? '数字' : Array.isArray(effectiveDefault) ? 'JSON 数组' : 'JSON 对象')
  }
  if (!constraints.length && !enums.length && !Object.keys(node).length && segments.length)
    constraints.push('JSON/YAML 值；格式及范围由对应模块 Schema 校验')
  // z.custom 的模板路径类型不能导出 JSON Schema；补充实际 AbsolutePathSchema 的约束。
  const absolutePath = ['kit', 'serv'].includes(context.name)
    && (segments.at(-1) === 'keyExchangePath' || segments.at(-2) === 'excludePaths'
      || (context.name === 'serv' && segments[0] === 'http' && ['path', 'readyPath', 'prefix'].includes(segments.at(-1))))
  if (absolutePath) {
    const unrepresentable = constraints.indexOf('JSON/YAML 值；格式及范围由对应模块 Schema 校验')
    if (unrepresentable >= 0)
      constraints.splice(unrepresentable, 1)
    constraints.push('以 / 开头的路径字符串')
  }
  if (constraints.length || enums.length) {
    const parentDoc = segments.at(-1) === '0' ? context.docs.get(segments.slice(0, -1).join('.')) : undefined
    const providerDescription = context.name === 'vecdb' && ({
      apiKey: 'Qdrant：API key；Chroma：Authorization Bearer token，用于同协议的自托管服务/网关，不提供 Chroma Cloud 契约',
      url: 'pgvector：连接串；Qdrant：HTTP(S) 服务地址；Chroma：HTTP(S) 根端点，优先于 host/port，不允许凭据、路径前缀、query 或 fragment',
    })[segments.join('.')]
    const description = providerDescription || node.description || context.docs.get(segments.join('.')) || (parentDoc && `${parentDoc}；此变量整体替换单个数组项`) || fieldDescription(context.name, segments) || `${context.name}.${segments.join('.')} 配置${segments.length ? '项' : '对象'}`
    const value = effectiveDefault === undefined ? '' : typeof effectiveDefault === 'object' ? JSON.stringify(effectiveDefault) : String(effectiveDefault)
    add(name, { module: context.name, path: [context.name, ...segments].join('.'), description, constraints, enums, value })
  }
  for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])])
    walkSchema(branch, segments, context, ancestors, effectiveDefault)
  for (const [key, property] of Object.entries(node.properties ?? {}))
    walkSchema(property, [...segments, key], context, ancestors, effectiveDefault && typeof effectiveDefault === 'object' && !Array.isArray(effectiveDefault) ? effectiveDefault[key] : undefined)
  if (node.items)
    walkSchema(node.items, [...segments, '0'], context, ancestors)
}

for (const [name, pkg, exported] of modules) {
  const entry = await import(`@h-ai/${pkg}`)
  const schema = entry[exported]?.toJSONSchema({ io: 'input', unrepresentable: 'any' })
  if (!schema)
    throw new Error(`Missing public schema: @h-ai/${pkg}.${exported}`)
  // 联合类型及复用的 datapipe/transport 配置，字段说明可能位于独立的类型文件。
  const sources = [path.join(root, 'packages', pkg, 'src', `${pkg}-config.ts`)]
  for (const sourcePackage of [...new Set([pkg, ...(pkg === 'ai' ? ['datapipe'] : []), ...(['kit', 'serv'].includes(pkg) ? ['crypto'] : [])])]) {
    const directory = path.join(root, 'packages', sourcePackage, 'src')
    for (const file of await readdir(directory, { recursive: true })) {
      if (/(?:config|types)\.ts$/.test(file) && !file.endsWith('.d.ts'))
        sources.push(path.join(directory, file))
    }
  }
  const sourceContents = await Promise.all([...new Set(sources)].map(async file => [file, await readFile(file, 'utf8')]))
  const docs = schemaDocumentation(sourceContents, exported)
  walkSchema(schema, [], { name, schema, docs })
}

/** 收集真实的直接读取入口及示例/模板引用；忽略本地 .env 与生成产物。 */
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isDirectory() && item.name.startsWith('.'))
      continue
    if (['node_modules', 'dist', 'build', '.svelte-kit', 'paraglide', '.turbo', 'test-results', 'target', 'tests', '__tests__'].includes(item.name))
      continue
    const file = path.join(directory, item.name)
    if (item.isDirectory()) {
      await scan(file)
      continue
    }
    if ((!/\.(?:ts|js|mjs|py|svelte|ya?ml|hbs|example)$/.test(item.name) && item.name !== 'hai.json') || item.name.endsWith('.d.ts'))
      continue
    const content = environmentReferenceSource(await readFile(file, 'utf8'), file)
    const location = path.relative(root, file).replaceAll('\\', '/')
    if (/\/config\/[^/]+\.ya?ml(?:\.hbs)?$/.test(location)) {
      const configName = item.name.replace(/^_/, '').replace(/\.ya?ml(?:\.hbs)?$/, '')
      const name = `HAI_${configName.toUpperCase()}`
      if (!variables.has(name))
        add(name, { module: configName, path: configName, description: `${configName} 配置对象`, constraints: ['JSON 对象；整体替换该配置'], enums: [], value: '' })
    }
    for (const match of content.matchAll(/(?:process\.env|import\.meta\.env)(?:\?\.)?\.?(?:([A-Z][A-Z0-9_]+)|\[['"]([A-Z][A-Z0-9_]+)['"]\])|\$\{((?:HAI_|PUBLIC_|VITE_)[A-Z0-9_]+)(?::([^}]*))?\}/g)) {
      const name = match[1] ?? match[2] ?? match[3]
      if (name.endsWith('_') || (match[0].startsWith('import.meta.env') && ['SSR', 'MODE', 'DEV', 'PROD', 'BASE_URL'].includes(name)))
        continue
      if (!explicit.has(name))
        explicit.set(name, { source: location, value: match[4] ?? '' })
    }
    // 本地模型镜像同样属于模块可配置入口；只读取变量名与字面量默认值。
    for (const match of content.matchAll(/os\.(?:environ\.(?:get|setdefault)|getenv)\(\s*['"]([A-Z][A-Z0-9_]*)['"](?:\s*,\s*['"]([^'"\n]*)['"])?/g)) {
      if (!explicit.has(match[1]))
        explicit.set(match[1], { source: location, value: match[2] ?? '' })
    }
    if (item.name === '.env.example') {
      for (const match of content.matchAll(/^(?:#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/gm)) {
        // 框架及客户端字段以 Schema、YAML 和代码为准，避免旧清单重新引入已删除别名。
        if (/^(?:HAI_|PUBLIC_|VITE_)/.test(match[1]))
          continue
        if (!explicit.has(match[1])) {
          const parsed = parseEnv(`${match[1]}=${match[2]}`)
          explicit.set(match[1], { source: location, value: parsed[match[1]] ?? '' })
        }
      }
    }
  }
}
await scan(path.join(root, 'packages'))
await scan(path.join(root, 'apps'))
await scan(path.join(root, 'scripts'))

// 桌面应用使用本地 Schema，非框架包导出；补充其可整体覆盖的传输配置节点。
explicit.set('HAI_CRYPTO_TRANSPORT', { source: 'apps/desktop-app/src/lib/crypto-config-schema.ts', value: 'false' })

const extraDescriptions = {
  PATH: ['操作系统提供的可执行程序搜索路径；CLI 用于定位已安装的 pnpm', '保留系统原值；由操作系统路径分隔符连接，不要在 .env 中置空或作为应用配置覆盖'],
  NODE_ENV: ['Node/Vite 运行模式', 'development | test | production'],
  HOST: ['部署平台 HTTP 监听地址，覆盖 serv/kit server.host', '主机名或 IP'],
  PORT: ['部署平台 HTTP 监听端口，覆盖 serv/kit server.port', '整数 1–65535'],
  PUBLIC_API_BASE: ['浏览器/原生客户端 API 地址，不能含凭据', '有效 HTTP(S) URL；是否含 /api/v1 以对应客户端为准'],
  PUBLIC_API_TRANSPORT: ['客户端传输加密开关，须与服务端一致', 'on | off'],
  PUBLIC_API_KEY_EXCHANGE_PATH: ['公开密钥交换端点，须与服务端一致', '以 / 开头的路径'],
  HAI_CRYPTO_TRANSPORT_KEYEXCHANGEPATH: ['桌面示例公开密钥交换端点，构建期插值', '以 / 开头的路径'],
  HAI_CRYPTO_TRANSPORT_SERVERKEYRING: ['服务端受管版本化传输密钥环；仅私有环境或 Secret Manager 注入', 'JSON 对象 {activeKeyId,keys:{id:{publicKey,privateKey}}}；所有节点共享，ID 为 1-64 个字母/数字/下划线/连字符；禁止 PUBLIC_/VITE_/公开 YAML/日志'],
  HAI_CRYPTO_TRANSPORT: ['桌面示例公开传输配置；在构建阶段与浏览器使用同一 Schema 校验', 'false 关闭；或 JSON/YAML 对象，keyExchangePath 须以 / 开头；不接受 true'],
  VITE_ADAPTER: ['SvelteKit 构建适配器', 'node | static；未识别的值回退 node'],
  HAI_ADMIN_DEFAULT_PASSWORD: ['首次创建管理员的密码', '满足 IAM 密码策略；敏感值仅在本地或目标进程注入'],
  HAI_E2E: ['示例/模板端到端测试开关', '1 启用；其余值关闭'],
  CI: ['持续集成环境标记', 'true 或 1 启用；未设置为本地运行'],
  GITHUB_API_URL: ['发布检查使用的 GitHub API 基础地址', '有效 HTTP(S) URL；默认 https://api.github.com'],
  GITHUB_OUTPUT: ['GitHub Actions 步骤输出文件', '由工作流自动注入的可写文件路径'],
  GITHUB_REF_NAME: ['发布检查使用的 Git 分支或标签名', '由 GitHub Actions 注入的引用名称'],
  GITHUB_REPOSITORY: ['发布检查使用的 GitHub 仓库', 'owner/repo 格式'],
  GITHUB_TOKEN: ['发布检查调用 GitHub API 的认证令牌', '敏感字符串；权限由目标仓库与工作流决定'],
  LEAK_WORDS: ['提交检查禁止出现的词语', 'JSON 字符串数组，或逗号/换行分隔的词语列表'],
  HAI_AUTH_EVIDENCE_DIR: ['浏览器验收截图输出目录', '目录路径'],
  HAI_CONTACT_RECIPIENT: ['企业官网联系表单的通知收件人', '有效邮箱地址'],
  HAI_CONTAINER_ENGINE: ['部署/集成测试使用的容器引擎', 'docker | podman'],
  HAI_DOCKER_PROD_BUILD: ['容器生产构建时省略声明文件和 sourcemap', 'true 启用；其余值关闭'],
  HAI_MODEL_API_KEY: ['本地语音模型 HTTP 服务的 Bearer 认证密钥', '敏感字符串；空值表示该模型服务未启用认证'],
  HAI_MODEL_ID: ['本地模型权重的 Hugging Face 仓库 ID', '有效模型仓库 ID，例如组织名/模型名；由模型目录提供默认值'],
  HAI_MODEL_REVISION: ['Hugging Face 权重修订版本', '仓库已有的分支、标签或 commit；为空时使用厂商默认版本'],
  HAI_MODELSCOPE_ID: ['本地模型权重的 ModelScope 仓库 ID', '有效模型仓库 ID；优先使用模型目录的配置'],
  HAI_MODELSCOPE_REVISION: ['ModelScope 权重修订版本', '仓库已有的分支、标签或 commit；通常为 master'],
  HAI_MODEL_OUTPUT_DIR: ['模型 prepare 子进程的权重输出目录', '目录路径；通常由 model:prepare 自动注入'],
  MODEL_PATH: ['模型容器内的权重目录或模型仓库 ID', '可读取的模型路径或有效仓库 ID；默认 /opt/models'],
  SERVED_MODEL_NAME: ['vLLM 对外报告的模型名', '非空字符串；客户端请求 model 须与之匹配'],
  DEVICE: ['本地语音模型运行设备', 'auto | cpu | cuda；auto 按 CUDA 可用性选择'],
  COMPUTE_TYPE: ['faster-whisper 计算精度', 'auto | default | float32 | float16 | bfloat16 | int16 | int8 | int8_float32 | int8_float16 | int8_bfloat16；须受当前设备支持'],
  VLLM_EXTRA_ARGS: ['追加到 vLLM 服务的启动参数', '按 shell 参数语法拆分的字符串；参数由当前 vLLM 版本校验'],
  VLLM_USE_MODELSCOPE: ['vLLM 是否通过 ModelScope 下载权重', '1 | true | yes 启用（忽略大小写）；其余值关闭'],
  HF_ENDPOINT: ['Hugging Face 下载服务基础地址', '有效 HTTP(S) URL；本地模型下载回退默认 https://hf-mirror.com'],
  HF_HUB_OFFLINE: ['本地模型是否只使用已存在的离线权重', '1 启用；其余值关闭；离线权重缺失时启动失败'],
  HAI_E2E_DATA_ROOT: ['端到端测试的隔离运行数据目录', '目录路径'],
  HAI_E2E_LIVE: ['AI 示例启用真实厂商端到端测试', '1 启用；其余值关闭'],
  HAI_E2E_MOCK: ['AI 示例使用确定性端到端测试服务', '1 启用；其余值关闭'],
  HAI_KIT_COOKIE_KEY: ['kit Cookie 加密密钥', '满足 crypto SM4 密钥格式；敏感值仅本机或目标进程注入'],
  HAI_PARTNER_USERNAME: ['企业官网合作伙伴演示的登录用户名', '非空字符串'],
  HAI_PARTNER_PASSWORD: ['企业官网合作伙伴演示的登录密码', '敏感字符串，仅本机或目标进程注入'],
  HAI_PARTNER_SESSIONTTLSECONDS: ['合作伙伴演示会话有效期', '正整数，单位秒'],
  HAI_REACH_PROVIDERS_0_HEADERS_AUTHORIZATION: ['API 通知 Provider 的完整 Authorization 请求头', '敏感字符串，包含认证方案及凭据，例如 Bearer <token>'],
  CAPACITOR_SERVER_URL: ['Capacitor 开发时的前端热加载地址', '有效 HTTP(S) URL；发布原生包时不设置'],
  E2E_ADMIN_PASSWORD: ['端到端测试创建的管理员密码', '满足 IAM 密码策略；仅测试进程使用'],
  E2E_PORT: ['端到端测试 Web 服务监听端口', '整数 1–65535'],
  BASE_URL: ['Playwright 验收访问的前端基础地址', '有效 HTTP(S) URL；按项目 Playwright 配置选择默认端口'],
  HAI_E2E_WEB_URL: ['Fullstack Web 端验收地址', '有效 HTTP(S) URL；同时决定对应预览服务的监听地址'],
  HAI_E2E_APP_URL: ['Fullstack 移动端浏览器预览验收地址', '有效 HTTP(S) URL；同时决定对应预览服务的监听地址'],
  HAI_E2E_DESKTOP_URL: ['Fullstack 桌面端浏览器预览验收地址', '有效 HTTP(S) URL；同时决定对应预览服务的监听地址'],
  IAM_FIXTURE_LDAP: ['通知测试服务是否启用 LDAP fixture', '0 关闭；1 启用'],
  IAM_NOTIFICATION_PORT: ['通知测试服务监听端口', '整数 1–65535'],
  IAM_NOTIFICATION_URL: ['确定性通知测试服务地址', '有效 HTTP(S) URL'],
  LANG: ['子进程默认语言与字符集', '操作系统支持的 locale，例如 en_US.UTF-8'],
  LC_ALL: ['子进程所有 locale 分类的覆盖值', '操作系统支持的 locale，例如 en_US.UTF-8'],
  LC_MESSAGES: ['CLI 消息语言；HAI_CORE_DEFAULTLOCALE、LC_ALL 优先，LANG 后备', '操作系统支持的 locale，例如 en_US.UTF-8'],
  PUBLIC_API_BASE_BASE64: ['容器生成前端运行时配置时使用的 API 地址编码', 'PUBLIC_API_BASE 的 Base64 编码，不含凭据'],
  PYTHONIOENCODING: ['本地 Python 模型进程标准输入输出编码', 'Python 支持的编码名，通常 utf-8'],
  SERVICE_BASE_URL: ['Fullstack 开发代理访问服务端的地址', '有效 HTTP(S) URL'],
  TAURI_DEV_HOST: ['Tauri 开发时 HMR 可访问的宿主机地址', '主机名或 IP，由 Tauri 开发工具注入'],
  VITEST: ['Vitest 自动注入的测试运行标记', 'true 表示运行测试；通常无需手动设置'],
}
for (const [name, entry] of explicit) {
  if (variables.has(name))
    continue
  const indexed = variables.get(name.replace(/_\d+(?=_|$)/g, '_0'))
  if (indexed) {
    add(name, { ...indexed, name, path: name })
    continue
  }
  const sensitive = /(?:KEY|TOKEN|PASSWORD|SECRET|PASS|AUTHORIZATION)(?:_|$)/.test(name)
  const providerKey = /^(?:(?:HAI_AI_(?:AUDIO|IMAGE)_)?[A-Z0-9]+_APIKEY|[A-Z0-9]+_(?:API_KEY|ACCESS_KEY|APP_KEY))$/.test(name)
  const meta = extraDescriptions[name]
    ?? (providerKey ? [`${name.replace(/^HAI_AI_(?:AUDIO|IMAGE)_/, '').replace(/_APIKEY$|_(?:API_KEY|ACCESS_KEY|APP_KEY)$/, '')} 厂商凭据回退；优先在模型项配置 apiKey`, '敏感字符串，启用对应厂商时注入'] : undefined)
    ?? (name.endsWith('_BASE_URL') ? ['厂商 SDK 服务基础地址回退', '有效 HTTP(S) URL'] : undefined)
    ?? (name === 'DASHSCOPE_WORKSPACE_ID' ? ['DashScope 厂商工作空间标识', '字符串，由厂商控制台提供'] : undefined)
  const inferred = entry.value === 'true' || entry.value === 'false'
    ? 'true | false'
    : /^\d+$/.test(entry.value)
      ? '整数；单位及上下界由使用位置的 Schema 校验'
      : /(?:URL|BASE_URL|API_BASE)$/.test(name)
        ? '有效 URL；不得包含凭据'
        : '字符串；按使用位置的校验规则填写'
  add(name, {
    // 该 Secret 只属于服务端实际读取入口，不能随桌面端公开 crypto 配置自动推荐。
    module: name === 'HAI_CRYPTO_TRANSPORT_SERVERKEYRING' ? 'runtime' : name.startsWith('HAI_') ? name.split('_')[1].toLowerCase() : 'runtime',
    path: name,
    description: meta?.[0] ?? `${sensitive ? '凭据输入' : '环境入口'}；使用位置 ${entry.source}`,
    constraints: [meta?.[1] ?? (sensitive ? '敏感字符串；启用相应功能时必填，不得提交真实值' : inferred)],
    enums: [],
    value: sensitive ? '' : entry.value,
  })
}

// 没有 Schema 默认值时，示例优先使用真实 YAML 的公共默认值或合法枚举，避免给出空枚举值。
for (const [name, entry] of variables) {
  if (entry.value !== '')
    continue
  if (entry.enums.length)
    entry.value = explicit.get(name)?.value || String(entry.enums[0])
  else if (!/PASSWORD|SECRET|TOKEN|APIKEY|API_KEY|ACCESSKEY|PRIVATEKEY|_PASS$|AUTHORIZATION/.test(name))
    entry.value = explicit.get(name)?.value ?? ''
}

const catalog = [...variables.values()].sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name))
const catalogText = `${JSON.stringify(catalog.map(({ constraints, enums, ...entry }) => ({
  ...entry,
  constraint: entry.name === 'HAI_DB_SSL' ? 'MySQL：false 或严格 TLS 对象（{} 默认校验证书链和 DNS 身份）；PostgreSQL：布尔值、require/prefer/allow/disable 或 TLS 对象' : [...constraints, ...(enums.length ? [`取值：${enums.map(value => String(value)).join(' | ')}`] : [])].join('；'),
})), null, 2)}\n`
const catalogFile = path.join(root, 'packages/cli/src/commands/cli-config-catalog.json')
const envText = [
  '# hai-framework 环境变量总表（由 scripts/generate-env-catalog.mjs 生成）',
  '# 所有变量默认注释；按应用 .env.example 选择启用，公共值放已跟踪的 .env / .env.dev / .env.test / .env.prod，私有值仅放 .env.local 或进程环境。',
  '# 赋值为合法示例或建议值，不代表所有字段的 Schema 默认值；实际默认、单位和消费位置见 .agents/skills/hai-module-create/configuration.md。',
  '# 规则、加载优先级与环境命令：README.md 的配置与环境变量章节。',
  '# HAI_<配置名>_<路径>；camelCase 不拆词；数组的 0 可替换为任意有效索引。',
  '# 对象/数组变量整体替换节点并优先于叶子；叶子覆盖要求 YAML 已声明路径。',
  '# Schema 枚举和上下界如下；Provider 的依赖与跨字段条件仍由模块校验。',
  '',
  ...JSON.parse(catalogText).flatMap(entry => [
    `# ${entry.path} — ${entry.description.replace(/\s+/g, ' ')}`,
    `# 约束：${entry.constraint || '由对应模块 Schema 校验'}`,
    `# ${entry.name}=${JSON.stringify(entry.value)}`,
    '',
  ]),
].join('\n')
if (process.argv.includes('--check')) {
  if ((await readFile(catalogFile, 'utf8')).replaceAll('\r\n', '\n') !== catalogText || (await readFile(path.join(root, '.env.example'), 'utf8')).replaceAll('\r\n', '\n') !== envText)
    throw new Error('Environment catalog is stale; run pnpm generate:env after building packages')
}
else {
  await writeFile(catalogFile, catalogText)
  await writeFile(path.join(root, '.env.example'), envText)
}
process.stdout.write(`Environment catalog: ${catalog.length} variables\n`)
