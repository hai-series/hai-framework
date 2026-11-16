"""网页作业共用的 URL 和部署出网代理校验。"""
import ipaddress
import os
import re
from urllib.parse import urlsplit
from tool import ToolError

HOST = re.compile(r'(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{1,62}\Z', re.ASCII)


def parse_url(url):
    if not isinstance(url, str) or len(url) > 2048 or any(ord(c) <= 32 or c == '\\' for c in url):
        raise ToolError('INVALID_REQUEST', 'Expected an HTTPS URL')
    try:
        parsed = urlsplit(url)
        if (parsed.scheme == 'https' and parsed.username is None and parsed.password is None
                and parsed.hostname and HOST.fullmatch(parsed.hostname) and parsed.port in (None, 443)):
            return url
    except ValueError:
        pass
    raise ToolError('INVALID_REQUEST', 'Expected HTTPS with a DNS hostname and default port')


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
