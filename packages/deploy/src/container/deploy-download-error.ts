/**
 * @h-ai/deploy — Nginx 下载失败提示。
 *
 * 独立 HTML 随代理配置交付，语言由浏览器的 Accept-Language 选择。
 * @module deploy-download-error
 */
import { deployM } from '../deploy-i18n.js'

/** 页面样式直接嵌入响应，在下载地址下也能独立显示。 */
const PAGE_STYLE = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: #f1f5f9;
    color: #172033;
    font-family: Inter, system-ui, "Microsoft YaHei", sans-serif;
    line-height: 1.7;
  }
  main {
    width: min(100%, 640px);
    padding: clamp(24px, 6vw, 48px);
    border: 1px solid #dbe3ee;
    border-top: 4px solid #2563eb;
    border-radius: 12px;
    background: #fff;
  }
  h1 { margin: 0 0 16px; font-size: clamp(24px, 5vw, 32px); line-height: 1.4; }
  p { margin: 0; color: #475569; font-size: 16px; }
`

/** 字典中的显示文本进入 HTML 文本节点前转义。 */
function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** 构建不依赖应用资源、查询参数或浏览器脚本的本地化提示页。 */
function renderPage(): string {
  return `<!doctype html>
<html lang="$hai_download_language">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="referrer" content="no-referrer">
  <link rel="icon" href="data:,">
  <title>$hai_download_title</title>
  <style>${PAGE_STYLE}</style>
</head>
<body><main><h1>$hai_download_title</h1><p>$hai_download_instruction</p></main></body>
</html>`
}

/**
 * 生成 http 级别的下载请求识别和提示页语言映射。
 * @returns 无请求地址和凭据的 map 配置。
 * @example 模块内部上下文
 * ```ts
 * const maps = renderDownloadErrorMaps()
 * ```
 */
export function renderDownloadErrorMaps(): string {
  return `map "$request_method:$args" $hai_signed_download {
  default 0;
  "~*^(GET|HEAD):(?:[^&]*&)*X-Amz-Signature=[^&]+(?:&|$)" 1;
}
map $http_accept_language $hai_download_language {
  default zh-CN;
  ~*^en en-US;
  ~*^ja ja-JP;
}
map $hai_download_language $hai_download_title {
  default ${JSON.stringify(escapeHtml(deployM('deploy_downloadUnavailableTitle', { locale: 'zh-CN' })))};
  en-US ${JSON.stringify(escapeHtml(deployM('deploy_downloadUnavailableTitle', { locale: 'en-US' })))};
  ja-JP ${JSON.stringify(escapeHtml(deployM('deploy_downloadUnavailableTitle', { locale: 'ja-JP' })))};
}
map $hai_download_language $hai_download_instruction {
  default ${JSON.stringify(escapeHtml(deployM('deploy_downloadUnavailableInstruction', { locale: 'zh-CN' })))};
  en-US ${JSON.stringify(escapeHtml(deployM('deploy_downloadUnavailableInstruction', { locale: 'en-US' })))};
  ja-JP ${JSON.stringify(escapeHtml(deployM('deploy_downloadUnavailableInstruction', { locale: 'ja-JP' })))};
}
`
}

/**
 * 生成 server 级别的下载错误页命名 location。
 * @returns 404 HTML 响应配置，禁止缓存和来源传播。
 * @example 模块内部上下文
 * ```ts
 * const location = renderDownloadErrorLocation()
 * ```
 */
export function renderDownloadErrorLocation(): string {
  return `  location @hai_download_unavailable {
    access_log off;
    error_log /dev/null;
    types { }
    default_type text/html;
    charset utf-8;
    add_header Cache-Control "private, no-store" always;
    add_header Referrer-Policy no-referrer always;
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
    return 404 ${JSON.stringify(renderPage())};
  }
`
}
