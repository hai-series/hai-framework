import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tool import serve


def load(kind):
    spec = importlib.util.spec_from_file_location(kind, ROOT / kind / 'operation.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.commands


class ToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.inputs = self.root / 'input'
        self.outputs = self.root / 'output'
        self.inputs.mkdir()
        self.outputs.mkdir()

    def run_tool(self, kind, request):
        result = io.StringIO()
        serve(io.BytesIO(json.dumps(request).encode()), result, load(kind), self.inputs, self.outputs)
        return json.loads(result.getvalue())

    def test_extract_text_and_reject_link_escape(self):
        (self.inputs / 'plain.txt').write_text('Hello, 文件。', encoding='utf-8')
        args = {'operation': 'documents.extract', 'input': 'plain.txt'}
        self.assertEqual(self.run_tool('documents', args), {'success': True, 'data': {'text': 'Hello, 文件。'}})
        (self.inputs / 'link.txt').symlink_to(self.inputs / 'plain.txt')
        for name in ['../plain.txt', '/etc/passwd', 'link.txt']:
            self.assertFalse(self.run_tool('documents', {**args, 'input': name})['success'])

    def test_reject_unknown_fields_and_oversized_json(self):
        bad = self.run_tool('documents', {'operation': 'documents.extract', 'input': 'plain.txt', 'command': 'wrong'})
        self.assertEqual(bad['error']['code'], 'INVALID_REQUEST')
        result = io.StringIO()
        serve(io.BytesIO(b' ' * 70_000), result, load('documents'), self.inputs, self.outputs)
        self.assertEqual(json.loads(result.getvalue())['error']['code'], 'INVALID_REQUEST')

    def test_office_rejects_external_document_relationships(self):
        with zipfile.ZipFile(self.inputs / 'linked.docx', 'w') as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('word/document.xml', '<document/>')
            archive.writestr('word/_rels/document.xml.rels', '<Relationships><Relationship TargetMode="External" Target="https://example.test/file"/></Relationships>')
        result = self.run_tool('office', {'operation': 'office.convert', 'input': 'linked.docx', 'output': 'result.pdf'})
        self.assertEqual(result['error']['code'], 'UNSAFE_DOCUMENT')
        self.assertEqual(list(self.outputs.iterdir()), [])

    def test_ocr_rejects_unsupported_input_and_language(self):
        (self.inputs / 'sample.png').write_bytes(b'invalid image data')
        args = {'operation': 'ocr.recognize', 'input': 'sample.png'}
        self.assertEqual(self.run_tool('ocr', {**args, 'language': '-bad'})['error']['code'], 'INVALID_REQUEST')
        self.assertEqual(self.run_tool('ocr', {**args, 'language': 'eng'})['error']['code'], 'INVALID_INPUT')

    def test_browser_rejects_invalid_url_and_missing_deployment_proxy(self):
        args = {'operation': 'browser.navigate', 'output': 'screen.png'}
        for url in ['file:///etc/passwd', 'http://example.test', 'https://person:token@example.test', 'https://127.0.0.1/']:
            self.assertEqual(self.run_tool('browser', {**args, 'url': url})['error']['code'], 'INVALID_REQUEST')
        self.assertEqual(self.run_tool('browser', {**args, 'url': 'https://example.test'})['error']['code'], 'NETWORK_POLICY_REQUIRED')

    def test_tool_cannot_overwrite_existing_outputs(self):
        artifact = self.outputs / 'screen.png'
        artifact.write_text('existing')
        args = {'operation': 'browser.navigate', 'output': artifact.name, 'url': 'https://example.test'}
        self.assertEqual(self.run_tool('browser', args)['error']['code'], 'INVALID_OUTPUT')
        self.assertEqual(artifact.read_text(), 'existing')


if __name__ == '__main__':
    unittest.main()
