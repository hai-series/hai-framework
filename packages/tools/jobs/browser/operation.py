import pathlib
from tool import ToolError, publish, run_command
from browser_policy import deployment_proxy, parse_url


def navigate(request, _source, artifact, workspace):
    url = parse_url(request['url'])
    if artifact.suffix.lower() != '.png':
        raise ToolError('INVALID_REQUEST', 'Browser screenshot must be PNG')
    proxy = deployment_proxy()
    result = workspace / 'screen.png'
    worker = pathlib.Path(__file__).with_name('render.mjs')
    run_command(['node', str(worker), proxy, url, str(result)], 45, workspace)
    return publish(result, artifact, b'\x89PNG\r\n\x1a\n')


commands = {'browser.navigate': ({'url', 'output'}, set(), navigate)}
