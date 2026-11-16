"""离线视频渲染作业。"""
import math
import pathlib
import re
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
from tool import ToolError, publish, run_command
from media_files import extract_project


def local_resource(value, directory, base):
    if not value or value.startswith('#'):
        return
    if '\\' in value or any(ord(character) < 32 for character in value):
        raise ToolError('INVALID_PROJECT', 'Project resource has an unsafe path')
    parsed = urlsplit(value)
    path = pathlib.PurePosixPath(unquote(parsed.path))
    if parsed.scheme or parsed.netloc or path.is_absolute():
        raise ToolError('INVALID_PROJECT', 'Project resources must use local relative files')
    target = base.joinpath(*path.parts).resolve()
    if not target.is_relative_to(directory.resolve()) or not target.is_file():
        raise ToolError('INVALID_PROJECT', 'Project resource is missing or escapes the project')


def validate_css(source, directory, base):
    for value in re.findall(r'''url\(\s*["']?([^"')]+)''', source, flags=re.IGNORECASE):
        local_resource(value.strip(), directory, base)
    for value in re.findall(r'''@import\s+["']([^"']+)["']''', source, flags=re.IGNORECASE):
        local_resource(value, directory, base)


class Composition(HTMLParser):
    def __init__(self, directory, base):
        super().__init__()
        self.attributes = None
        self.directory = directory
        self.base = base
        self.in_style = False

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        # 浏览器采用首个重复属性，dict 则保留最后一个；拒绝歧义以保持校验与渲染一致。
        if len(values) != len(attributes):
            raise ToolError('INVALID_PROJECT', 'Project HTML contains duplicate attributes')
        if self.attributes is None and 'data-composition-id' in values:
            self.attributes = values
        for key in ('src', 'poster', 'data-composition-src'):
            if values.get(key):
                local_resource(values[key], self.directory, self.base)
        if tag in ('link', 'base') and values.get('href'):
            local_resource(values['href'], self.directory, self.base)
        if values.get('style'):
            validate_css(values['style'], self.directory, self.base)
        for item in values.get('srcset', '').split(','):
            if item.strip():
                local_resource(item.split()[0], self.directory, self.base)
        if tag == 'style':
            self.in_style = True

    def handle_endtag(self, tag):
        if tag == 'style':
            self.in_style = False

    def handle_data(self, source):
        if self.in_style:
            validate_css(source, self.directory, self.base)


def validate_project(directory):
    source = directory / 'index.html'
    if not source.is_file() or source.stat().st_size > 2 * 1024 * 1024:
        raise ToolError('INVALID_PROJECT', 'Project must contain a bounded index.html')
    document = Composition(directory, source.parent)
    document.feed(source.read_text(encoding='utf-8'))
    try:
        values = document.attributes or {}
        duration = float(values['data-duration'])
        width = int(values['data-width'])
        height = int(values['data-height'])
        start = float(values.get('data-start', '0'))
        if (not math.isfinite(duration) or not 0 < duration <= 30 or start != 0
                or not 16 <= width <= 1920 or not 16 <= height <= 1920
                or width * height > 1920 * 1080 or width % 2 or height % 2):
            raise ValueError
    except (KeyError, TypeError, ValueError):
        raise ToolError('INVALID_PROJECT', 'Composition duration or dimensions exceed the supported limits') from None
    for file in directory.rglob('*'):
        if file.suffix.lower() == '.css':
            validate_css(file.read_text(encoding='utf-8'), directory, file.parent)
        elif file.suffix.lower() == '.html' and file != source:
            Composition(directory, file.parent).feed(file.read_text(encoding='utf-8'))
    return duration, width, height


def render(request, source, artifact, workspace):
    fps = request.get('fps', 30)
    if type(fps) is not int or fps not in (24, 25, 30) or source.suffix.lower() != '.zip' or artifact.suffix.lower() != '.mp4':
        raise ToolError('INVALID_REQUEST', 'Video rendering requires a ZIP project, MP4 output and 24, 25 or 30 fps')
    directory = workspace / 'project'
    directory.mkdir()
    extract_project(source, directory)
    duration, width, height = validate_project(directory)
    worker = pathlib.Path(__file__).with_name('render.mjs')
    result = workspace / 'result.mp4'
    run_command(['node', str(worker), str(directory), str(result), str(fps), str(duration), str(width), str(height)], 300, workspace)
    return publish(result, artifact, b'ftyp', 4)


commands = {'video.render': ({'input', 'output'}, {'fps'}, render)}
