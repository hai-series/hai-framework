"""离线前端预览构建作业，项目代码只编译，不在构建宿主执行。"""
import json
import pathlib
import zipfile
from media_files import archive_path, extract_project
from tool import ToolError, publish, run_command

PROJECT_LIMIT = 8 * 1024 * 1024
SOURCE_LIMIT = 1024 * 1024
SOURCE_EXTENSIONS = frozenset({'.html', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.svelte', '.css', '.json'})
ERROR_CODES = frozenset({'INVALID_PROJECT', 'UNSUPPORTED_PROJECT', 'OUTPUT_LIMIT', 'ENVIRONMENT_UNAVAILABLE'})


def build(request, source, artifact, workspace):
    if source.suffix.lower() != '.zip' or artifact.suffix.lower() != '.html':
        raise ToolError('INVALID_REQUEST', 'Preview building requires a ZIP project and HTML output')
    try:
        with zipfile.ZipFile(source) as archive:
            entries = archive.infolist()
            if sum(entry.file_size for entry in entries) > PROJECT_LIMIT:
                raise ToolError('UNSAFE_PROJECT', 'Preview project exceeds the extraction budget')
            for entry in entries:
                name = archive_path(entry.filename)
                if any(part.casefold() == 'node_modules' for part in name.parts):
                    raise ToolError('UNSUPPORTED_PROJECT', 'Project dependencies must not be bundled in the archive')
                if name.suffix.lower() in SOURCE_EXTENSIONS and entry.file_size > SOURCE_LIMIT:
                    raise ToolError('UNSAFE_PROJECT', 'Preview source exceeds its size budget')
    except (zipfile.BadZipFile, RuntimeError, EOFError, NotImplementedError):
        raise ToolError('UNSAFE_PROJECT', 'Invalid or unsupported project archive') from None
    directory = workspace / 'project'
    directory.mkdir()
    extract_project(source, directory)
    if not (directory / 'index.html').is_file():
        raise ToolError('INVALID_PROJECT', 'Preview project requires index.html at its root')
    result = workspace / 'preview.html'
    status = workspace / 'build-result.json'
    worker = pathlib.Path(__file__).with_name('build.mjs')
    run_command(['node', str(worker), str(directory), str(result), str(status)], 60, workspace)
    try:
        if status.stat().st_size > 4096:
            raise ValueError
        outcome = json.loads(status.read_text(encoding='utf-8'))
        if not isinstance(outcome, dict) or type(outcome.get('success')) is not bool:
            raise ValueError
        if not outcome['success']:
            code = outcome.get('code')
            if code not in ERROR_CODES:
                raise ValueError
            raise ToolError(code, {
                'INVALID_PROJECT': 'Project source could not be compiled',
                'UNSUPPORTED_PROJECT': 'Project contains an unsupported dependency, resource or browser feature',
                'OUTPUT_LIMIT': 'Self-contained preview exceeds the output budget',
                'ENVIRONMENT_UNAVAILABLE': 'The fixed preview toolchain is unavailable',
            }[code])
        if not result.is_file() or not 0 < result.stat().st_size <= SOURCE_LIMIT:
            raise ValueError
    except (OSError, ValueError, KeyError, TypeError):
        raise ToolError('INVALID_OUTPUT', 'Preview builder did not produce a valid artifact') from None
    return publish(result, artifact, b'<!doctype html>')


commands = {'preview.build': ({'input', 'output'}, set(), build)}
