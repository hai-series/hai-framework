"""受控网页采集作业。"""
import json
import pathlib
from tool import TEXT_LIMIT, ToolError, publish, run_command
from browser_policy import deployment_proxy, parse_url
from media_files import CAPTURE_INSTRUCTION_FILES, bundle_capture, collect_files


def capture(request, _source, artifact, workspace):
    url = parse_url(request['url'])
    maximum = request.get('maxScreenshots', 4)
    if type(maximum) is not int or not 1 <= maximum <= 8 or artifact.suffix.lower() != '.zip':
        raise ToolError('INVALID_REQUEST', 'Capture requires ZIP output and one to eight screenshots')
    proxy = deployment_proxy()
    worker = pathlib.Path(__file__).with_name('capture.mjs')
    try:
        run_command(['node', str(worker), proxy, url, str(workspace / 'capture'), str(maximum)], 180, workspace)
    except ToolError:
        diagnostic = workspace / 'capture-error.json'
        code = None
        try:
            if diagnostic.is_file() and not diagnostic.is_symlink() and diagnostic.stat().st_size <= 1024:
                value = json.loads(diagnostic.read_text(encoding='utf-8'))
                code = value.get('code') if isinstance(value, dict) else None
        except (OSError, ValueError, UnicodeError):
            pass
        if code == 'SANDBOX_UNAVAILABLE':
            raise ToolError('SANDBOX_UNAVAILABLE', 'The environment cannot enable the required Chromium sandbox') from None
        if code == 'TIMEOUT':
            raise ToolError('TIMEOUT', 'The capture deadline was exceeded') from None
        if code == 'NAVIGATION_RETRY_FAILED':
            raise ToolError('NAVIGATION_RETRY_FAILED', 'Navigation failed after one transient network retry') from None
        raise
    directory = workspace / 'capture'
    files = collect_files(directory, CAPTURE_INSTRUCTION_FILES)
    names = [name for name, _ in files]
    if 'extracted/tokens.json' not in names or 'extracted/visible-text.txt' not in names:
        raise ToolError('INVALID_OUTPUT', 'Capture did not produce source text and design tokens')
    try:
        tokens = json.loads((directory / 'extracted' / 'tokens.json').read_text(encoding='utf-8'))
        text = (directory / 'extracted' / 'visible-text.txt').read_text(encoding='utf-8')
    except (ValueError, RecursionError):
        raise ToolError('INVALID_OUTPUT', 'Capture tokens or source text could not be decoded') from None
    if not isinstance(tokens, dict):
        raise ToolError('INVALID_OUTPUT', 'Capture tokens are invalid')
    title = tokens.get('title')
    description = tokens.get('description')
    if any(value is not None and not isinstance(value, str) for value in (title, description)):
        raise ToolError('INVALID_OUTPUT', 'Capture title or description is invalid')
    colors = tokens.get('colors', [])
    if not isinstance(colors, list) or any(not isinstance(color, str) or len(color) > 256 for color in colors):
        raise ToolError('INVALID_OUTPUT', 'Capture colors are invalid')
    screenshots = [name for name in names if name.startswith('screenshots/') and name.endswith('.png')]
    if not text.strip() or len(text.encode('utf-8')) > TEXT_LIMIT or not screenshots:
        raise ToolError('INVALID_OUTPUT', 'Capture did not produce bounded text and screenshots')
    summary = {
        'sourceUrl': url,
        'title': (title or '')[:2048],
        'description': (description or '')[:8192],
        'text': text,
        'colors': colors[:20],
        'screenshots': screenshots,
        'materials': names,
    }
    document = {**summary, 'renderer': {'name': 'hyperframes', 'version': '0.9.56'}}
    try:
        encoded = json.dumps(document, ensure_ascii=False).encode('utf-8')
    except UnicodeEncodeError:
        raise ToolError('INVALID_OUTPUT', 'Capture metadata is not valid UTF-8 text') from None
    (directory / 'capture.json').write_bytes(encoded)
    result = workspace / 'capture.zip'
    bundle_capture(directory, result)
    return {**publish(result, artifact, b'PK\x03\x04'), 'summary': summary}


commands = {'web.capture': ({'url', 'output'}, {'maxScreenshots'}, capture)}
