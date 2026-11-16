"""媒体项目和采集素材的有界归档读写。"""
import pathlib
import shutil
import stat
import zipfile
from tool import FILE_LIMIT, ToolError

ENTRY_LIMIT = 256
EXPANDED_LIMIT = 100 * 1024 * 1024


def archive_path(name):
    if not isinstance(name, str) or not name or len(name) > 512 or '\\' in name or '\x00' in name:
        raise ToolError('UNSAFE_PROJECT', 'Archive entry has an unsafe path')
    path = pathlib.PurePosixPath(name)
    if (path.is_absolute() or any(part in ('', '.', '..') for part in name.rstrip('/').split('/'))
            or any(':' in part or part.startswith('.') for part in path.parts)):
        raise ToolError('UNSAFE_PROJECT', 'Archive entry escapes the project')
    return path


def extract_project(source, destination):
    try:
        with zipfile.ZipFile(source) as archive:
            entries = archive.infolist()
            seen = set()
            if len(entries) > ENTRY_LIMIT or sum(entry.file_size for entry in entries) > EXPANDED_LIMIT:
                raise ToolError('UNSAFE_PROJECT', 'Project archive exceeds the extraction limits')
            for entry in entries:
                path = archive_path(entry.filename)
                identity = str(path).casefold()
                mode = entry.external_attr >> 16
                if (identity in seen or entry.flag_bits & 1 or entry.file_size > FILE_LIMIT
                        or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR))):
                    raise ToolError('UNSAFE_PROJECT', 'Project contains duplicate, linked or unsupported entries')
                seen.add(identity)
                target = destination.joinpath(*path.parts)
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(entry) as incoming, target.open('xb') as output:
                    shutil.copyfileobj(incoming, output)
                if target.stat().st_size != entry.file_size:
                    raise ToolError('UNSAFE_PROJECT', 'Project entry size is inconsistent')
    except (zipfile.BadZipFile, RuntimeError, EOFError, NotImplementedError):
        raise ToolError('UNSAFE_PROJECT', 'Invalid or unsupported project archive') from None


def collect_files(directory):
    files = []
    total = 0
    for path in sorted(directory.rglob('*')):
        info = path.lstat()
        if stat.S_ISDIR(info.st_mode):
            continue
        if not stat.S_ISREG(info.st_mode) or info.st_size > FILE_LIMIT:
            raise ToolError('INVALID_OUTPUT', 'Capture contains linked or oversized materials')
        relative = path.relative_to(directory).as_posix()
        archive_path(relative)
        total += info.st_size
        files.append((relative, path))
        if len(files) > ENTRY_LIMIT or total > EXPANDED_LIMIT:
            raise ToolError('OUTPUT_LIMIT', 'Capture exceeds the artifact limits')
    return files


def bundle_capture(directory, output):
    files = collect_files(directory)
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for relative, source in files:
            archive.write(source, relative)
    if output.stat().st_size > FILE_LIMIT:
        raise ToolError('OUTPUT_LIMIT', 'Capture archive exceeds the artifact limit')
