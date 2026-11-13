"""对 Office ZIP 容器执行解包配额和主动内容筛查。"""
import pathlib
import xml.etree.ElementTree as ET
import zipfile
from tool import ToolError


class OfficeArchive:
    def __init__(self, path):
        self.archive = zipfile.ZipFile(path)
        try:
            files = self.archive.infolist()
            names = [item.filename for item in files]
            if len(files) > 2048 or len(names) != len(set(names)) or sum(item.file_size for item in files) > 100 * 1024 * 1024:
                raise ToolError('UNSAFE_DOCUMENT', 'Document exceeds the archive limits')
            for item in files:
                name = item.filename.lower()
                parts = pathlib.PurePosixPath(name).parts
                if (name.startswith('/') or '\\' in name or '..' in parts or item.flag_bits & 1
                        or 'vbaproject' in name or '/embeddings/' in name or '/activex/' in name
                        or '/externallinks/' in name or name.startswith(('basic/', 'scripts/'))):
                    raise ToolError('UNSAFE_DOCUMENT', 'Document contains unsupported active content')
        except BaseException:
            self.archive.close()
            raise

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.archive.close()

    def xml(self, name):
        info = self.archive.getinfo(name)
        if info.file_size > 16 * 1024 * 1024:
            raise ToolError('UNSAFE_DOCUMENT', 'Document XML exceeds the size limit')
        source = self.archive.read(info).decode('utf-8-sig')
        if '<!DOCTYPE' in source or '<!ENTITY' in source or '\x00' in source:
            raise ToolError('UNSAFE_DOCUMENT', 'Document XML must not define entities')
        return ET.fromstring(source)

    def reject_external_links(self):
        for name in self.archive.namelist():
            if name.endswith('.rels'):
                for link in self.xml(name):
                    if link.get('TargetMode', '').lower() == 'external':
                        raise ToolError('UNSAFE_DOCUMENT', 'Document references an external resource')
            if name in ('content.xml', 'styles.xml', 'settings.xml'):
                for element in self.xml(name).iter():
                    link = element.get('{http://www.w3.org/1999/xlink}href', '')
                    if link.startswith(('.', '/', '\\')) or ':' in link:
                        raise ToolError('UNSAFE_DOCUMENT', 'Document references an external resource')


def office_archive_error():
    return ToolError('INVALID_INPUT', 'Invalid office document')
