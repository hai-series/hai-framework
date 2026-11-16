import xml.etree.ElementTree as ET
import zipfile
from archives import OfficeArchive, office_archive_error
from tool import TEXT_LIMIT, ToolError, read_text, run_command, text_result

WORD = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
SHEET = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'


def collect_lines(lines):
    result = []
    size = 0
    for line in lines:
        size += len(line.encode('utf-8')) + 1
        if size > TEXT_LIMIT:
            raise ToolError('OUTPUT_LIMIT', 'Extracted text exceeds the size limit')
        result.append(line)
    return text_result('\n'.join(result))


def word_lines(document):
    for paragraph in document.xml('word/document.xml').iter(WORD + 'p'):
        yield ''.join(value.text or '' for value in paragraph.iter(WORD + 't'))


def sheet_lines(document):
    names = document.archive.namelist()
    strings = []
    if 'xl/sharedStrings.xml' in names:
        for item in document.xml('xl/sharedStrings.xml').iter(SHEET + 'si'):
            strings.append(''.join(value.text or '' for value in item.iter(SHEET + 't')))
    worksheets = sorted(name for name in names if name.startswith('xl/worksheets/') and name.rsplit('/', 1)[1].startswith('sheet') and name.endswith('.xml'))
    if not worksheets:
        raise office_archive_error()
    for name in worksheets:
        yield name.rsplit('/', 1)[1]
        for row in document.xml(name).iter(SHEET + 'row'):
            values = []
            for cell in row.findall(SHEET + 'c'):
                value = cell.findtext(SHEET + 'v') or ''
                cell_type = cell.get('t')
                if cell_type == 's':
                    index = int(value)
                    if index < 0 or index >= len(strings):
                        raise office_archive_error()
                    value = strings[index]
                elif cell_type == 'inlineStr':
                    value = ''.join(item.text or '' for item in cell.iter(SHEET + 't'))
                values.append(value)
            yield '\t'.join(values)


def extract(_request, source, _artifact, workspace):
    suffix = source.suffix.lower()
    if suffix in ('.txt', '.md', '.csv', '.tsv'):
        try:
            return read_text(source)
        except UnicodeDecodeError:
            raise ToolError('INVALID_INPUT', 'Expected UTF-8 document text') from None
    if suffix == '.pdf':
        with source.open('rb') as stream:
            if not stream.read(5) == b'%PDF-':
                raise ToolError('INVALID_INPUT', 'Invalid PDF document')
        result = workspace / 'extracted.txt'
        # 额外读取一页检测超限，避免把较长文档报告为完整输出。
        run_command(['pdftotext', '-l', '101', '-enc', 'UTF-8', str(source), str(result)], 30, workspace)
        extracted = read_text(result)
        if extracted['text'].count('\f') > 100:
            raise ToolError('OUTPUT_LIMIT', 'PDF exceeds the page limit')
        return extracted
    if suffix in ('.docx', '.xlsx'):
        try:
            with OfficeArchive(source) as document:
                return collect_lines(word_lines(document) if suffix == '.docx' else sheet_lines(document))
        except (zipfile.BadZipFile, KeyError, ValueError, ET.ParseError):
            raise office_archive_error() from None
    raise ToolError('INVALID_INPUT', 'Unsupported document format')


commands = {'documents.extract': ({'input'}, set(), extract)}
