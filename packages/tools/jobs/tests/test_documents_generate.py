import io
import json
import pathlib
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tool import serve
from test_hai_tool import load


class GenerateDocumentsTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = pathlib.Path(self.temporary.name)
        self.inputs = self.root / 'input'
        self.outputs = self.root / 'output'
        self.inputs.mkdir()
        self.outputs.mkdir()

    def invoke(self, specification, output):
        (self.inputs / 'source.json').write_text(json.dumps(specification, ensure_ascii=False), encoding='utf-8')
        response = io.StringIO()
        serve(io.BytesIO(json.dumps({'operation': 'documents.generate', 'input': 'source.json', 'output': output}).encode()),
              response, load('documents'), self.inputs, self.outputs)
        return json.loads(response.getvalue())

    def test_docx_contains_title_paragraphs_and_real_table(self):
        result = self.invoke({'title': '发布说明', 'paragraphs': ['工具可以独立调用。'],
                              'table': {'headers': ['模块', '状态'], 'rows': [['Tools', '完成']]}}, 'report.docx')
        self.assertTrue(result['success'], result)
        with zipfile.ZipFile(self.outputs / 'report.docx') as archive:
            document = ET.fromstring(archive.read('word/document.xml'))
            texts = [node.text for node in document.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t')]
            self.assertIn('发布说明', texts)
            self.assertIn('工具可以独立调用。', texts)
            self.assertIn('Tools', texts)
            self.assertEqual(len(list(document.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tbl'))), 1)

    def test_xlsx_writes_user_content_as_strings_without_formulas(self):
        values = ['=1+1', '=WEBSERVICE("https://example.com")', '+2+3', '@SUM(A1:A2)']
        result = self.invoke({'title': '安全表格', 'table': {'headers': ['输入'], 'rows': [[value] for value in values]}}, 'report.xlsx')
        self.assertTrue(result['success'], result)
        with zipfile.ZipFile(self.outputs / 'report.xlsx') as archive:
            sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            namespace = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
            self.assertEqual(list(sheet.iter(namespace + 'f')), [])
            texts = [node.text for node in sheet.iter(namespace + 't')]
            for value in values:
                self.assertIn(value, texts)

    def test_pptx_contains_real_slides_and_table(self):
        result = self.invoke({'title': '工具平台', 'slides': [
            {'title': '一个入口', 'paragraphs': ['复用同一工具实现。']},
            {'title': '能力清单', 'table': {'headers': ['能力', '用途'], 'rows': [['网页', '采集素材']]}},
        ]}, 'report.pptx')
        self.assertTrue(result['success'], result)
        with zipfile.ZipFile(self.outputs / 'report.pptx') as archive:
            slides = [name for name in archive.namelist() if name.startswith('ppt/slides/slide') and name.endswith('.xml')]
            self.assertEqual(len(slides), 2)
            drawing = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
            first = ET.fromstring(archive.read('ppt/slides/slide1.xml'))
            second = ET.fromstring(archive.read('ppt/slides/slide2.xml'))
            self.assertIn('一个入口', [node.text for node in first.iter(drawing + 't')])
            self.assertEqual(len(list(second.iter(drawing + 'tbl'))), 1)

    def test_rejects_unknown_fields_controls_and_excessive_or_ragged_tables(self):
        invalid = [
            {'title': 'Report', 'command': 'execute'},
            {'title': 'Report\u0000'},
            {'title': 'x' * 201},
            {'title': 'Report', 'paragraphs': ['item'] * 101},
            {'title': 'Report', 'table': {'headers': ['a', 'b'], 'rows': [['only one']]}},
            {'title': 'Report', 'table': {'headers': ['a'] * 21, 'rows': []}},
            {'title': 'Report', 'table': {'headers': ['a'], 'rows': [['item']] * 201}},
            {'title': 'Report', 'slides': [{'title': 'Only slides'}]},
        ]
        for index, specification in enumerate(invalid):
            with self.subTest(specification=index):
                result = self.invoke(specification, f'invalid{index}.docx')
                self.assertEqual(result['error']['code'], 'INVALID_REQUEST')
        self.assertEqual(list(self.outputs.iterdir()), [])

    def test_rejects_oversized_specs_and_non_office_output(self):
        result = self.invoke({'title': 'Report', 'paragraphs': ['x' * (256 * 1024)]}, 'large.docx')
        self.assertEqual(result['error']['code'], 'INVALID_INPUT')
        result = self.invoke({'title': 'Report'}, 'report.pdf')
        self.assertEqual(result['error']['code'], 'INVALID_REQUEST')

    def test_pptx_rejects_ambiguous_or_unbounded_slide_layout(self):
        for specification in [
            {'title': 'Report', 'paragraphs': ['summary'], 'slides': [{'title': 'Slide'}]},
            {'title': 'Report', 'slides': [{'title': 'Slide'}] * 21},
            {'title': 'Report', 'table': {'headers': ['Column'], 'rows': [['text' * 20]]}},
        ]:
            result = self.invoke(specification, 'large.pptx')
            self.assertEqual(result['error']['code'], 'INVALID_REQUEST')
        self.assertEqual(list(self.outputs.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
