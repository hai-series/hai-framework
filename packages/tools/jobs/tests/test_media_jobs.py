import importlib.util
import io
import json
import os
import pathlib
import stat
import sys
import tempfile
import unittest
import warnings
import zipfile
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tool import ToolError, serve


def load(kind):
    spec = importlib.util.spec_from_file_location('hai_' + kind, ROOT / kind / 'operation.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MediaJobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.inputs = self.root / 'input'
        self.outputs = self.root / 'output'
        self.inputs.mkdir()
        self.outputs.mkdir()

    def invoke(self, module, request):
        response = io.StringIO()
        serve(io.BytesIO(json.dumps(request).encode()), response,
              module.commands, self.inputs, self.outputs)
        return json.loads(response.getvalue())

    def project(self, name='project.zip', html=None, entries=None):
        if html is None:
            html = '<div data-composition-id="intro" data-start="0" data-duration="4" data-width="1280" data-height="720">Hello</div>'
        with zipfile.ZipFile(self.inputs / name, 'w') as archive:
            archive.writestr('index.html', html)
            for path, content in entries or []:
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore', UserWarning)
                    archive.writestr(path, content)
        return name

    def test_capture_returns_source_text_and_actual_materials_in_archive(self):
        module = load('web_capture')

        def capture(args, timeout, workspace):
            destination = workspace / 'capture'
            (destination / 'screenshots').mkdir(parents=True)
            (destination / 'extracted').mkdir()
            (destination / 'screenshots' / 'page.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture')
            (destination / 'extracted' / 'visible-text.txt').write_text('Actual product description')
            (destination / 'extracted' / 'tokens.json').write_text(json.dumps({
                'title': 'Product', 'description': 'A real product', 'colors': ['#123456'],
            }))

        with patch.dict(os.environ, {'HAI_TOOL_BROWSER_PROXY': 'http://192.0.2.10:3128'}, clear=True):
            with patch.object(module, 'run_command', capture, create=True):
                result = self.invoke(module, {'operation': 'web.capture', 'url': 'https://example.com/', 'output': 'capture.zip'})
        self.assertTrue(result['success'], result)
        self.assertEqual(result['data']['artifact']['name'], 'capture.zip')
        with zipfile.ZipFile(self.outputs / 'capture.zip') as archive:
            metadata = json.loads(archive.read('capture.json'))
            self.assertEqual(metadata['sourceUrl'], 'https://example.com/')
            self.assertEqual(metadata['text'], 'Actual product description')
            self.assertEqual(metadata['title'], 'Product')
            self.assertIn('screenshots/page.png', metadata['screenshots'])
            self.assertIn('#123456', metadata['colors'])

    def test_capture_requires_deployment_proxy_and_rejects_request_overrides(self):
        module = load('web_capture')
        args = {'operation': 'web.capture', 'url': 'https://example.com/', 'output': 'capture.zip'}
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.invoke(module, args)['error']['code'], 'NETWORK_POLICY_REQUIRED')
        for change in [{'proxy': 'http://192.0.2.10:3128'}, {'maxScreenshots': True}, {'maxScreenshots': 9}, {'url': 'https://127.0.0.1/'}]:
            with self.subTest(change=change):
                self.assertEqual(self.invoke(module, {**args, **change})['error']['code'], 'INVALID_REQUEST')

    def test_capture_refuses_incomplete_capture_and_linked_materials(self):
        module = load('web_capture')

        def capture(args, timeout, workspace):
            destination = workspace / 'capture'
            destination.mkdir()
            (destination / 'outside.txt').symlink_to('/etc/passwd')

        with patch.dict(os.environ, {'HAI_TOOL_BROWSER_PROXY': 'http://192.0.2.10:3128'}, clear=True):
            with patch.object(module, 'run_command', capture, create=True):
                result = self.invoke(module, {'operation': 'web.capture', 'url': 'https://example.com/', 'output': 'capture.zip'})
        self.assertFalse(result['success'])
        self.assertEqual(list(self.outputs.iterdir()), [])

    def test_video_renders_valid_local_project_and_publishes_mp4(self):
        module = load('video_render')
        source = self.project(entries=[('assets/narration.wav', b'RIFFfixture')])
        calls = []

        def render(args, timeout, workspace):
            calls.append(args)
            self.assertEqual((workspace / 'project' / 'index.html').read_text().count('data-composition-id'), 1)
            self.assertEqual((workspace / 'project' / 'assets' / 'narration.wav').read_bytes(), b'RIFFfixture')
            (workspace / 'result.mp4').write_bytes(b'\x00\x00\x00\x20ftypisom' + b'fixture' * 4)

        with patch.object(module, 'run_command', render, create=True):
            result = self.invoke(module, {'operation': 'video.render', 'input': source, 'output': 'intro.mp4', 'fps': 24})
        self.assertTrue(result['success'], result)
        self.assertEqual(result['data']['artifact']['name'], 'intro.mp4')
        self.assertEqual(len(calls), 1)
        self.assertIn('24', calls[0])

    def test_video_rejects_archive_escape_links_and_duplicate_paths(self):
        module = load('video_render')
        cases = [('../escape.txt', b'escape'), ('/absolute.txt', b'escape'), ('assets\\escape.txt', b'escape'), ('index.html', b'duplicate')]
        for index, entry in enumerate(cases):
            with self.subTest(entry=entry[0]):
                source = self.project(name=f'unsafe{index}.zip', entries=[entry])
                result = self.invoke(module, {'operation': 'video.render', 'input': source, 'output': f'unsafe{index}.mp4'})
                self.assertEqual(result['error']['code'], 'UNSAFE_PROJECT')
        source = self.project(name='link.zip')
        with zipfile.ZipFile(self.inputs / source, 'a') as archive:
            link = zipfile.ZipInfo('assets/link')
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, '/etc/passwd')
        self.assertEqual(self.invoke(module, {'operation': 'video.render', 'input': source, 'output': 'link.mp4'})['error']['code'], 'UNSAFE_PROJECT')
        self.assertEqual(list(self.outputs.iterdir()), [])

    def test_video_checks_duration_resolution_and_fps_before_starting(self):
        module = load('video_render')
        for index, attributes in enumerate([
            'data-duration="31" data-width="1280" data-height="720"',
            'data-duration="NaN" data-width="1280" data-height="720"',
            'data-duration="4" data-width="3840" data-height="2160"',
        ]):
            with self.subTest(attributes=attributes):
                source = self.project(name=f'limit{index}.zip', html=f'<div data-composition-id="intro" {attributes}></div>')
                self.assertEqual(self.invoke(module, {'operation': 'video.render', 'input': source, 'output': f'limit{index}.mp4'})['error']['code'], 'INVALID_PROJECT')
        source = self.project()
        self.assertEqual(self.invoke(module, {'operation': 'video.render', 'input': source, 'output': 'bad.mp4', 'fps': True})['error']['code'], 'INVALID_REQUEST')

    def test_video_failed_renderer_cannot_publish_partial_output(self):
        module = load('video_render')
        source = self.project()

        def fail(args, timeout, workspace):
            (workspace / 'result.mp4').write_bytes(b'partial')
            raise ToolError('TOOL_FAILED', 'Renderer failed')

        with patch.object(module, 'run_command', fail, create=True):
            result = self.invoke(module, {'operation': 'video.render', 'input': source, 'output': 'failed.mp4'})
        self.assertEqual(result['error']['code'], 'TOOL_FAILED')
        self.assertEqual(list(self.outputs.iterdir()), [])

    def test_video_rejects_remote_and_escaping_project_resources(self):
        module = load('video_render')
        for index, element in enumerate([
            '<img src="https://example.com/remote.png">',
            '<script src="../outside.js"></script>',
            '<style>body { background: url(file:///etc/passwd) }</style>',
        ]):
            with self.subTest(element=element):
                source = self.project(name=f'resource{index}.zip', html=f'<div data-composition-id="intro" data-duration="4" data-width="1280" data-height="720">{element}</div>')
                result = self.invoke(module, {'operation': 'video.render', 'input': source, 'output': f'resource{index}.mp4'})
                self.assertEqual(result['error']['code'], 'INVALID_PROJECT')

    def test_project_entry_count_is_bounded_before_renderer_starts(self):
        module = load('video_render')
        source = self.project(entries=[(f'assets/file{i}.txt', 'fixture') for i in range(256)])
        result = self.invoke(module, {'operation': 'video.render', 'input': source, 'output': 'excessive.mp4'})
        self.assertEqual(result['error']['code'], 'UNSAFE_PROJECT')

    def test_video_allows_nested_compositions_to_reference_local_shared_assets(self):
        module = load('video_render')
        source = self.project(entries=[
            ('compositions/scene.html', '<img src="../assets/page.png">'),
            ('assets/page.png', b'\x89PNG\r\n\x1a\nfixture'),
        ])

        def render(args, timeout, workspace):
            (workspace / 'result.mp4').write_bytes(b'\x00\x00\x00\x20ftypisom' + b'fixture' * 4)

        with patch.object(module, 'run_command', render):
            result = self.invoke(module, {'operation': 'video.render', 'input': source, 'output': 'nested.mp4'})
        self.assertTrue(result['success'], result)


if __name__ == '__main__':
    unittest.main()
