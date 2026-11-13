#!/usr/bin/python3
"""固定工具镜像的单请求入口。"""
import json
import os
import pathlib
import re
import shutil
import signal
import stat
import subprocess
import sys
import tempfile

REQUEST_LIMIT = 64 * 1024
FILE_LIMIT = 50 * 1024 * 1024
TEXT_LIMIT = 256 * 1024
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z', re.ASCII)


class ToolError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def require_name(name, code):
    if not isinstance(name, str) or not NAME.fullmatch(name):
        raise ToolError(code, 'A simple file name is required')
    return name


def input_file(root, name):
    path = root / require_name(name, 'INVALID_INPUT')
    try:
        info = path.lstat()
    except OSError:
        raise ToolError('INVALID_INPUT', 'Input file is unavailable') from None
    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= FILE_LIMIT:
        raise ToolError('INVALID_INPUT', 'Input is not a regular file or exceeds the size limit')
    return path


def output_file(root, name):
    path = root / require_name(name, 'INVALID_OUTPUT')
    if os.path.lexists(path):
        raise ToolError('INVALID_OUTPUT', 'Output already exists')
    return path


def text_result(text):
    if len(text.encode('utf-8')) > TEXT_LIMIT:
        raise ToolError('OUTPUT_LIMIT', 'Extracted text exceeds the size limit')
    return {'text': text}


def read_text(path):
    with path.open('rb') as source:
        data = source.read(TEXT_LIMIT + 1)
    if len(data) > TEXT_LIMIT:
        raise ToolError('OUTPUT_LIMIT', 'Extracted text exceeds the size limit')
    return text_result(data.decode('utf-8'))


def publish(source, output, signature):
    info = source.lstat()
    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= FILE_LIMIT:
        raise ToolError('INVALID_OUTPUT', 'Produced artifact is not a bounded regular file')
    with source.open('rb') as stream:
        if not stream.read(len(signature)).startswith(signature):
            raise ToolError('INVALID_OUTPUT', 'Produced artifact has an unexpected format')
        stream.seek(0)
        try:
            with output.open('xb') as destination:
                try:
                    shutil.copyfileobj(stream, destination)
                except OSError:
                    output.unlink(missing_ok=True)
                    raise
        except FileExistsError:
            raise ToolError('INVALID_OUTPUT', 'Output already exists') from None
    return {'artifact': {'name': output.name, 'bytes': info.st_size}}


def run_command(args, timeout, workdir):
    # 不继承代理、工具凭据或外部程序配置。诊断输出不能混入协议。
    env = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': str(workdir), 'TMPDIR': str(workdir), 'LANG': 'C.UTF-8'}
    with subprocess.Popen(args, cwd=workdir, env=env, stdin=subprocess.DEVNULL,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True) as child:
        try:
            code = child.wait(timeout=timeout)
        except BaseException:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()
            raise
        if code != 0:
            raise ToolError('TOOL_FAILED', 'The selected operation failed')


def no_duplicates(pairs):
    values = {}
    for key, value in pairs:
        if key in values:
            raise ToolError('INVALID_REQUEST', 'Duplicate request field')
        values[key] = value
    return values


def serve(source, response, commands, inputs, outputs):
    try:
        raw = source.read(REQUEST_LIMIT + 1)
        if len(raw) > REQUEST_LIMIT:
            raise ToolError('INVALID_REQUEST', 'Request exceeds the size limit')
        request = json.loads(raw.decode('utf-8'), object_pairs_hook=no_duplicates)
        operation = request.get('operation') if isinstance(request, dict) else None
        if not isinstance(operation, str) or operation not in commands:
            raise ToolError('INVALID_REQUEST', 'Unknown operation')
        required, optional, handler = commands[operation]
        keys = set(request) - {'operation'}
        if not required <= keys <= required | optional:
            raise ToolError('INVALID_REQUEST', 'Missing or unsupported request fields')
        item = input_file(inputs, request['input']) if 'input' in request else None
        artifact = output_file(outputs, request['output']) if 'output' in request else None
        with tempfile.TemporaryDirectory(prefix='hai-tool-') as workspace:
            data = handler(request, item, artifact, pathlib.Path(workspace))
        result = {'success': True, 'data': data}
    except ToolError as error:
        result = {'success': False, 'error': {'code': error.code, 'message': str(error)}}
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
        result = {'success': False, 'error': {'code': 'INVALID_REQUEST', 'message': 'Malformed JSON request'}}
    except subprocess.TimeoutExpired:
        result = {'success': False, 'error': {'code': 'TIMEOUT', 'message': 'The selected operation timed out'}}
    except (OSError, ValueError):
        result = {'success': False, 'error': {'code': 'TOOL_FAILED', 'message': 'The selected operation failed'}}
    response.write(json.dumps(result, ensure_ascii=True, allow_nan=False) + '\n')


if __name__ == '__main__':
    # 可执行文件只加载构建时随镜像复制的固定操作。
    sys.path.insert(0, '/opt/hai-tools')
    sys.modules['tool'] = sys.modules[__name__]
    from operation import commands
    serve(sys.stdin.buffer, sys.stdout, commands, pathlib.Path('/input'), pathlib.Path('/output'))
