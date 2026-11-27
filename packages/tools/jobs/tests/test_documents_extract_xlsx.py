import io
import json
import pathlib
import tempfile
import unittest
import zipfile
from test_hai_tool import load
from tool import TEXT_LIMIT, serve


SPREADSHEET = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
PACKAGE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/package/2006/relationships'
OFFICE_RELATIONSHIPS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
CONTENT_TYPES = 'http://schemas.openxmlformats.org/package/2006/content-types'


class ExtractXlsxTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = pathlib.Path(temporary.name)

    def extract(self, rows):
        with zipfile.ZipFile(self.directory / 'report.xlsx', 'w') as archive:
            archive.writestr('[Content_Types].xml', f'<Types xmlns="{CONTENT_TYPES}">'
                             '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                             '<Default Extension="xml" ContentType="application/xml"/>'
                             '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                             '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                             '</Types>')
            archive.writestr('_rels/.rels', f'<Relationships xmlns="{PACKAGE_RELATIONSHIPS}">'
                             f'<Relationship Id="rId1" Type="{OFFICE_RELATIONSHIPS}/officeDocument" Target="xl/workbook.xml"/>'
                             '</Relationships>')
            archive.writestr('xl/workbook.xml', f'<workbook xmlns="{SPREADSHEET}" xmlns:r="{OFFICE_RELATIONSHIPS}">'
                             '<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>')
            archive.writestr('xl/_rels/workbook.xml.rels', f'<Relationships xmlns="{PACKAGE_RELATIONSHIPS}">'
                             f'<Relationship Id="rId1" Type="{OFFICE_RELATIONSHIPS}/worksheet" Target="worksheets/sheet1.xml"/>'
                             '</Relationships>')
            archive.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="{SPREADSHEET}"><sheetData>{rows}</sheetData></worksheet>')
        response = io.StringIO()
        request = {'operation': 'documents.extract', 'input': 'report.xlsx'}
        serve(io.BytesIO(json.dumps(request).encode()), response, load('documents'), self.directory, self.directory)
        return json.loads(response.getvalue())

    def test_keeps_leading_and_intervening_rows_and_columns(self):
        result = self.extract('<row r="2"><c r="C2" t="inlineStr"><is><t>名称</t></is></c><c r="E2"><v>23</v></c></row>'
                              '<row r="5"><c r="A5"><v>9</v></c><c r="C5"><f>9+10</f><v>19</v></c></row>')
        self.assertEqual(result, {'success': True, 'data': {'text': 'sheet1.xml\n\n\t\t名称\t\t23\n\n\n9\t\t19'}})

    def test_infers_optional_row_and_cell_references(self):
        result = self.extract('<row><c><v>1</v></c><c r="C3"><v>3</v></c><c><v>4</v></c></row>'
                              '<row><c><v>5</v></c></row>')
        self.assertEqual(result, {'success': True, 'data': {'text': 'sheet1.xml\n\n\n1\t\t3\t4\n5'}})

    def test_rejects_invalid_or_ambiguous_coordinates(self):
        rows = [
            '<row r="0"><c><v>1</v></c></row>',
            '<row r="1048577"><c><v>1</v></c></row>',
            '<row r="1"><c r="XFE1"><v>1</v></c></row>',
            '<row r="1"><c r="A2"><v>1</v></c></row>',
            '<row r="1"><c r="A1"><v>1</v></c><c r="A1"><v>2</v></c></row>',
            '<row r="2"><c><v>1</v></c></row><row r="1"><c><v>2</v></c></row>',
        ]
        for sheet in rows:
            with self.subTest(sheet=sheet):
                result = self.extract(sheet)
                self.assertFalse(result['success'], result)
                self.assertEqual(result['error']['code'], 'INVALID_INPUT')

    def test_counts_sparse_padding_and_multibyte_text_against_output_limit(self):
        row = TEXT_LIMIT - len('sheet1.xml') - len('界'.encode('utf-8'))
        at_limit = self.extract(f'<row r="{row}"><c r="A{row}" t="inlineStr"><is><t>界</t></is></c></row>')
        self.assertTrue(at_limit['success'], at_limit)
        self.assertEqual(len(at_limit['data']['text'].encode('utf-8')), TEXT_LIMIT)
        beyond_limit = self.extract(f'<row r="{row}"><c r="B{row}" t="inlineStr"><is><t>界</t></is></c></row>')
        self.assertFalse(beyond_limit['success'], beyond_limit)
        self.assertEqual(beyond_limit['error']['code'], 'OUTPUT_LIMIT')
        distant_row = self.extract('<row r="1048576"><c r="A1048576"><v>1</v></c></row>')
        self.assertFalse(distant_row['success'], distant_row)
        self.assertEqual(distant_row['error']['code'], 'OUTPUT_LIMIT')
