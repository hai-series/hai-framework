"""网页作业共用的 URL 和部署出网代理校验。"""
import ipaddress
import os
import re
from urllib.parse import urlsplit
from tool import ToolError

URL_LIMIT = 2048
HOST = re.compile(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{0,61}[A-Za-z0-9]\Z', re.ASCII)
LOCAL_SUFFIX = re.compile(r'\.(?:localhost|local|internal|test|invalid)\Z', re.ASCII | re.IGNORECASE)


def parse_url(url):
    # 与 TypeScript isBrowserUrl 同步按原始地址和 Unicode 字符数校验。
    if (not isinstance(url, str) or len(url) > URL_LIMIT or url[:8].lower() != 'https://'
            or any(ord(c) <= 32 or c == '\\' or 0xD800 <= ord(c) <= 0xDFFF for c in url)):
        raise ToolError('INVALID_REQUEST', 'Expected an HTTPS URL')
    authority = re.split(r'[/?#]', url[8:], maxsplit=1)[0]
    host = re.sub(r':0*443\Z', '', authority)
    if len(host) > 253 or not HOST.fullmatch(host) or LOCAL_SUFFIX.search(host):
        raise ToolError('INVALID_REQUEST', 'Expected HTTPS with a DNS hostname and default port')
    return url


def deployment_proxy():
    # 代理身份来自部署环境；作业参数不能替换它。
    try:
        proxy = urlsplit(os.environ.get('HAI_TOOL_BROWSER_PROXY', ''))
        if (proxy.scheme != 'http' or proxy.username is not None or proxy.password is not None
                or proxy.path not in ('', '/') or proxy.query or proxy.fragment or not proxy.port):
            raise ValueError
        host = ipaddress.IPv4Address(proxy.hostname)
        if host.is_loopback or host.is_unspecified or host.is_multicast or host.is_link_local:
            raise ValueError
        return f'http://{host}:{proxy.port}'
    except (TypeError, ValueError):
        raise ToolError('NETWORK_POLICY_REQUIRED', 'A deployment-controlled egress proxy is required') from None
