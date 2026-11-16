"""从有界结构化内容生成 Office 文档，不执行用户代码或公式。"""
import json
from tool import TEXT_LIMIT, ToolError, no_duplicates, publish


def invalid(message):
    raise ToolError('INVALID_REQUEST', message)


def text(value, maximum, required=False):
    if (not isinstance(value, str) or len(value) > maximum or (required and not value.strip())
            or any((ord(item) < 32 and item not in '\t\n\r') or 0xD800 <= ord(item) <= 0xDFFF
                   or ord(item) & 0xFFFF in (0xFFFE, 0xFFFF) for item in value)):
        invalid('Document text has an unsupported type, character or length')
    return value


def paragraphs(value):
    if not isinstance(value, list) or len(value) > 100:
        invalid('Document paragraphs exceed the supported limits')
    return [text(item, 2000) for item in value]


def table(value):
    if not isinstance(value, dict) or not {'headers'} <= set(value) <= {'headers', 'rows'}:
        invalid('Document table fields are invalid')
    headers = value['headers']
    rows = value.get('rows', [])
    if not isinstance(headers, list) or not 1 <= len(headers) <= 20 or not isinstance(rows, list) or len(rows) > 200:
        invalid('Document table exceeds the row or column limits')
    result = {'headers': [text(item, 2000) for item in headers], 'rows': []}
    for row in rows:
        if not isinstance(row, list) or len(row) != len(headers):
            invalid('Document table rows must match the headers')
        result['rows'].append([text(item, 2000) for item in row])
    return result


def content(value):
    if not isinstance(value, dict) or not {'title'} <= set(value) <= {'title', 'paragraphs', 'table'}:
        invalid('Document content fields are invalid')
    return {
        'title': text(value['title'], 200, True),
        'paragraphs': paragraphs(value.get('paragraphs', [])),
        'table': table(value['table']) if 'table' in value else None,
    }


def slide_content(value):
    result = content(value)
    items = result['paragraphs']
    if len(result['title']) > 100 or len(items) > 6 or any(len(item) > 160 for item in items) or sum(map(len, items)) > 800:
        invalid('Presentation text exceeds the slide layout limits')
    grid = result['table']
    if grid:
        if (len(grid['headers']) > 6 or len(grid['rows']) > 6 or len(items) > 1
                or sum(map(len, items)) > 120
                or any(len(cell) > 32 for row in [grid['headers'], *grid['rows']] for cell in row)):
            invalid('Presentation table exceeds the slide layout limits')
    return result


def specification(source, suffix):
    if source.suffix.lower() != '.json' or source.stat().st_size > TEXT_LIMIT:
        raise ToolError('INVALID_INPUT', 'Document generation requires a JSON specification up to 256 KiB')
    try:
        value = json.loads(source.read_text(encoding='utf-8'), object_pairs_hook=no_duplicates)
    except (json.JSONDecodeError, UnicodeDecodeError):
        invalid('Document specification must be UTF-8 JSON')
    if not isinstance(value, dict):
        invalid('Document specification must be an object')
    if suffix == '.pptx' and 'slides' in value:
        if set(value) != {'title', 'slides'} or not isinstance(value['slides'], list) or not 1 <= len(value['slides']) <= 20:
            invalid('Presentation slides cannot be combined with top-level paragraphs or table')
        return {'title': text(value['title'], 200, True), 'slides': [slide_content(item) for item in value['slides']]}
    document = slide_content(value) if suffix == '.pptx' else content(value)
    return {'title': document['title'], 'slides': [document]} if suffix == '.pptx' else document


def write_docx(value, destination):
    from docx import Document

    document = Document()
    document.core_properties.title = value['title']
    document.add_heading(value['title'], level=0)
    for paragraph in value['paragraphs']:
        document.add_paragraph(paragraph)
    if value['table']:
        grid = value['table']
        rows = [grid['headers'], *grid['rows']]
        target = document.add_table(rows=len(rows), cols=len(grid['headers']))
        target.style = 'Table Grid'
        for row, values in zip(target.rows, rows):
            for cell, item in zip(row.cells, values):
                cell.text = item
    document.save(destination)


def write_xlsx(value, destination):
    from openpyxl import Workbook

    workbook = Workbook()
    workbook.properties.title = value['title']
    sheet = workbook.active
    sheet.title = 'Report'
    rows = [[value['title']], *[[item] for item in value['paragraphs']]]
    if value['table']:
        rows.extend([value['table']['headers'], *value['table']['rows']])
    for row_number, row in enumerate(rows, 1):
        for column_number, item in enumerate(row, 1):
            cell = sheet.cell(row=row_number, column=column_number, value=item)
            # 用户文本即使以等号开头也保持文本，不写入公式元素。
            cell.data_type = 's'
    workbook.save(destination)
    workbook.close()


def write_pptx(value, destination):
    from pptx import Presentation
    from pptx.util import Inches, Pt

    presentation = Presentation()
    presentation.slide_width = Inches(13.333)
    presentation.slide_height = Inches(7.5)
    presentation.core_properties.title = value['title']
    for content in value['slides']:
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        title = slide.shapes.add_textbox(Inches(0.6), Inches(0.4), Inches(12.1), Inches(0.9)).text_frame
        title.word_wrap = True
        title.paragraphs[0].text = content['title']
        title.paragraphs[0].font.size = Pt(30)
        title.paragraphs[0].font.bold = True
        body = slide.shapes.add_textbox(Inches(0.6), Inches(1.55), Inches(12.1), Inches(1 if content['table'] else 5.2)).text_frame
        body.word_wrap = True
        for index, item in enumerate(content['paragraphs']):
            paragraph = body.paragraphs[0] if index == 0 else body.add_paragraph()
            paragraph.text = item
            paragraph.font.size = Pt(20)
            paragraph.space_after = Pt(10)
        if content['table']:
            grid = content['table']
            rows = [grid['headers'], *grid['rows']]
            top = 2.65 if content['paragraphs'] else 1.55
            target = slide.shapes.add_table(len(rows), len(grid['headers']), Inches(0.6), Inches(top), Inches(12.1), Inches(min(4.2, len(rows) * 0.6))).table
            for row_number, values in enumerate(rows):
                for column_number, item in enumerate(values):
                    cell = target.cell(row_number, column_number)
                    cell.text = item
                    for paragraph in cell.text_frame.paragraphs:
                        paragraph.font.size = Pt(13)
        presentation.save(destination)


def generate(_request, source, artifact, workspace):
    suffix = artifact.suffix.lower()
    writers = {'.docx': write_docx, '.xlsx': write_xlsx, '.pptx': write_pptx}
    if suffix not in writers:
        invalid('Document output must be DOCX, XLSX or PPTX')
    value = specification(source, suffix)
    destination = workspace / ('result' + suffix)
    try:
        writers[suffix](value, destination)
    except ImportError:
        raise ToolError('ENVIRONMENT_UNAVAILABLE', 'The document generator dependencies are unavailable') from None
    return publish(destination, artifact, b'PK\x03\x04')
