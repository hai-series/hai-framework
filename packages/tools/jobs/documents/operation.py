import re
import xml.etree.ElementTree as ET
import zipfile
from archives import OfficeArchive, office_archive_error
from documents.generate import generate
from tool import TEXT_LIMIT, ToolError, read_text, run_command, text_result

WORD = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
SHEET = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

MAX_SHEET_ROW = 1_048_576
MAX_SHEET_COLUMN = 16_384
ROW_REFERENCE = r'[1-9][0-9]{0,6}'
CELL_REFERENCE = re.compile(rf'([A-Za-z]{{1,3}})({ROW_REFERENCE})')


def collect_text(parts):
    result = []
    size = 0
    for part in parts:
        if len(part) > TEXT_LIMIT - size:
            raise ToolError('OUTPUT_LIMIT', 'Extracted text exceeds the size limit')
        size += len(part.encode('utf-8'))
        if size > TEXT_LIMIT:
            raise ToolError('OUTPUT_LIMIT', 'Extracted text exceeds the size limit')
        result.append(part)
    return text_result(''.join(result))


def word_text_parts(document):
    for index, paragraph in enumerate(document.xml('word/document.xml').iter(WORD + 'p')):
        if index:
            yield '\n'
        yield ''.join(value.text or '' for value in paragraph.iter(WORD + 't'))


def cell_position(reference):
    match = CELL_REFERENCE.fullmatch(reference)
    if not match:
        raise office_archive_error()
    letters, row = match.groups()
    column = 0
    for letter in letters.upper():
        column = column * 26 + ord(letter) - ord('A') + 1
    return int(row), column


def row_position(row, previous_row):
    reference = row.get('r')
    if reference is not None:
        if not re.fullmatch(ROW_REFERENCE, reference):
            raise office_archive_error()
        return int(reference)
    # 行号省略时，优先依据该行第一个带坐标的单元格定位，否则紧随上一行。
    for cell in row.iterfind(SHEET + 'c'):
        reference = cell.get('r')
        if reference is not None:
            return cell_position(reference)[0]
    return previous_row + 1


def cell_text(cell, strings):
    value = cell.findtext(SHEET + 'v') or ''
    cell_type = cell.get('t')
    if cell_type == 's':
        index = int(value)
        if index < 0 or index >= len(strings):
            raise office_archive_error()
        return strings[index]
    if cell_type == 'inlineStr':
        return ''.join(value.text or '' for value in cell.iter(SHEET + 't'))
    return value


def sheet_text_parts(document):
    names = document.archive.namelist()
    strings = []
    if 'xl/sharedStrings.xml' in names:
        for item in document.xml('xl/sharedStrings.xml').iter(SHEET + 'si'):
            strings.append(''.join(value.text or '' for value in item.iter(SHEET + 't')))
    worksheets = sorted(name for name in names if name.startswith('xl/worksheets/') and name.rsplit('/', 1)[1].startswith('sheet') and name.endswith('.xml'))
    if not worksheets:
        raise office_archive_error()
    for index, name in enumerate(worksheets):
        if index:
            yield '\n'
        yield name.rsplit('/', 1)[1]
        previous_row = 0
        for row in document.xml(name).iterfind(SHEET + 'sheetData/' + SHEET + 'row'):
            current_row = row_position(row, previous_row)
            if not previous_row < current_row <= MAX_SHEET_ROW:
                raise office_archive_error()
            gap = current_row - previous_row
            if gap > TEXT_LIMIT:
                raise ToolError('OUTPUT_LIMIT', 'Extracted text exceeds the size limit')
            yield '\n' * gap
            previous_row = current_row

            previous_column = 0
            for cell in row.iterfind(SHEET + 'c'):
                reference = cell.get('r')
                if reference is None:
                    cell_row, column = current_row, previous_column + 1
                else:
                    cell_row, column = cell_position(reference)
                if cell_row != current_row or not previous_column < column <= MAX_SHEET_COLUMN:
                    raise office_archive_error()
                yield '\t' * (column - max(1, previous_column))
                yield cell_text(cell, strings)
                previous_column = column


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
                return collect_text(word_text_parts(document) if suffix == '.docx' else sheet_text_parts(document))
        except (zipfile.BadZipFile, KeyError, ValueError, ET.ParseError):
            raise office_archive_error() from None
    raise ToolError('INVALID_INPUT', 'Unsupported document format')


commands = {
    'documents.extract': ({'input'}, set(), extract),
    'documents.generate': ({'input', 'output'}, set(), generate),
}
