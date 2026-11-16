"""受控网页采集作业。"""
import json
import pathlib
from tool import TEXT_LIMIT, ToolError, publish, run_command
from browser_policy import deployment_proxy, parse_url
from media_files import bundle_capture, collect_files


def capture(request, _source, artifact, workspace):
    url = parse_url(request['url'])
    maximum = request.get('maxScreenshots', 4)
    if type(maximum) is not int or not 1 <= maximum <= 8 or artifact.suffix.lower() != '.zip':
        raise ToolError('INVALID_REQUEST', 'Capture requires ZIP output and one to eight screenshots')
    proxy = deployment_proxy()
    worker = pathlib.Path(__file__).with_name('capture.mjs')
    run_command(['node', str(worker), proxy, url, str(workspace / 'capture'), str(maximum)], 180, workspace)
    directory = workspace / 'capture'
    files = collect_files(directory)
    names = [name for name, _ in files]
    if 'extracted/tokens.json' not in names or 'extracted/visible-text.txt' not in names:
        raise ToolError('INVALID_OUTPUT', 'Capture did not produce source text and design tokens')
    tokens = json.loads((directory / 'extracted' / 'tokens.json').read_text(encoding='utf-8'))
    if not isinstance(tokens, dict):
        raise ToolError('INVALID_OUTPUT', 'Capture tokens are invalid')
    colors = tokens.get('colors', [])
    if not isinstance(colors, list) or any(not isinstance(color, str) or len(color) > 256 for color in colors):
        raise ToolError('INVALID_OUTPUT', 'Capture colors are invalid')
    text = (directory / 'extracted' / 'visible-text.txt').read_text(encoding='utf-8')
    screenshots = [name for name in names if name.startswith('screenshots/') and name.endswith('.png')]
    if not text.strip() or len(text.encode('utf-8')) > TEXT_LIMIT or not screenshots:
        raise ToolError('INVALID_OUTPUT', 'Capture did not produce bounded text and screenshots')
    summary = {
        'sourceUrl': url,
        'title': str(tokens.get('title', ''))[:2048],
        'description': str(tokens.get('description', ''))[:8192],
        'text': text,
        'colors': colors[:20],
        'screenshots': screenshots,
        'materials': names,
        'renderer': {'name': 'hyperframes', 'version': '0.9.56'},
    }
    (directory / 'capture.json').write_text(json.dumps(summary, ensure_ascii=False), encoding='utf-8')
    result = workspace / 'capture.zip'
    bundle_capture(directory, result)
    return publish(result, artifact, b'PK\x03\x04')


commands = {'web.capture': ({'url', 'output'}, {'maxScreenshots'}, capture)}
