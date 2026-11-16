import importlib.util
import io
import json
import os
import pathlib
import stat
import subprocess
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

    def browser_worker(self, mode):
        directory = self.root / ('browser-' + mode)
        package = directory / 'node_modules' / 'playwright-core'
        package.mkdir(parents=True)
        worker = directory / 'render.mjs'
        worker.write_text((ROOT / 'browser' / 'render.mjs').read_text())
        (package / 'package.json').write_text(json.dumps({'type': 'module', 'exports': './index.mjs'}))
        (package / 'index.mjs').write_text('''
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
const mode = MODE
const directory = dirname(process.argv[1])
const state = { clock: 0, navigation: [], screenshots: [], pageClosed: 0, browserClosed: 0 }
Object.defineProperty(globalThis, 'performance', { value: { now: () => state.clock } })
const persist = () => writeFile(directory + '/state.json', JSON.stringify(state))
const changed = url => new Error('page.goto: net::ERR_NETWORK_CHANGED at ' + url + '\\nCall log:\\nPRIVATE_BROWSER_DETAILS')
const page = {
  async goto(url, options) {
    state.navigation.push({ url, timeout: options.timeout })
    if (mode === 'recover' || mode === 'normalized' || mode === 'budget' || mode === 'exhausted' || mode === 'repeated') {
      state.clock += mode === 'budget' ? (state.navigation.length === 1 ? 17000 : 0) : mode === 'exhausted' ? 20000 : 3000
      await persist()
      if (state.navigation.length === 1 || mode === 'repeated') throw changed(mode === 'normalized' ? new URL(url).href : url)
    }
    else if (mode === 'reset' || mode === 'wrong-url' || mode === 'wrong-prefix' || mode === 'near-match') {
      await persist()
      const message = mode === 'reset' ? 'page.goto: net::ERR_CONNECTION_RESET at ' + url
        : mode === 'wrong-url' ? 'page.goto: net::ERR_NETWORK_CHANGED at https://other.example/'
        : mode === 'wrong-prefix' ? 'other: page.goto: net::ERR_NETWORK_CHANGED at ' + url
        : 'page.goto: net::ERR_NETWORK_CHANGEDNESS at ' + url
      throw new Error(message)
    }
    state.clock += mode === 'late' ? 40001 : 1000
    await persist()
    return { ok: () => mode !== 'http403' }
  },
  url() { return 'https://example.com/' },
  async screenshot(options) {
    state.screenshots.push({ timeout: options.timeout })
    await writeFile(options.path, 'partial-image')
    await persist()
    if (mode === 'screenshot-error') throw changed('https://example.com/')
    state.clock += 9000
    await writeFile(options.path, 'complete-image')
  },
  async close() { state.pageClosed++; await persist() },
}
export const chromium = {
  async launch(options) {
    state.launch = options
    state.clock += mode === 'budget' ? 9000 : 1000
    await persist()
    if (mode === 'sandbox-error') throw new Error('No usable sandbox PRIVATE_BROWSER_DETAILS')
    return {
      async newContext(options) {
        state.context = options
        return { async route() {}, async newPage() { return page } }
      },
      async close() { state.browserClosed++; await persist() },
    }
  },
}
'''.replace('MODE', json.dumps(mode)))
        output = directory / 'screen.png'
        output.write_bytes(b'stale-image')
        target = 'https://EXAMPLE.COM:443' if mode == 'normalized' else 'https://example.com/'
        result = subprocess.run(['node', str(worker), 'http://192.0.2.10:3128', target, str(output)],
                                capture_output=True, text=True, timeout=10)
        return result, output, json.loads((directory / 'state.json').read_text())

    def test_browser_worker_retries_exact_navigation_change_with_one_shared_budget(self):
        for mode in ['recover', 'normalized', 'budget']:
            with self.subTest(mode=mode):
                result, output, state = self.browser_worker(mode)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(output.read_bytes(), b'complete-image')
                self.assertEqual(len(state['navigation']), 2)
                self.assertTrue(all(item['url'] == 'https://example.com/' for item in state['navigation']))
                timeouts = [item['timeout'] for item in state['navigation']]
                self.assertTrue(all(0 < value <= 20000 for value in timeouts))
                self.assertLess(timeouts[1], timeouts[0])
                self.assertLessEqual(state['launch']['timeout'], 10000)
                self.assertLessEqual(state['screenshots'][0]['timeout'], 10000)
                self.assertLess(state['clock'], 40000)
                self.assertTrue(state['launch']['chromiumSandbox'])
                self.assertEqual(state['launch']['proxy'], {'server': 'http://192.0.2.10:3128', 'bypass': '<-loopback>'})
                self.assertFalse(state['context']['javaScriptEnabled'])
                self.assertFalse(state['context']['acceptDownloads'])
                self.assertEqual(state['context']['serviceWorkers'], 'block')
                self.assertEqual(state['pageClosed'], 1)
                self.assertEqual(state['browserClosed'], 1)

    def test_browser_worker_does_not_retry_other_failures_or_publish_old_images(self):
        for mode in ['http403', 'reset', 'wrong-url', 'wrong-prefix', 'near-match', 'repeated', 'exhausted', 'late', 'screenshot-error', 'sandbox-error']:
            with self.subTest(mode=mode):
                result, output, state = self.browser_worker(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(output.exists())
                self.assertNotIn('PRIVATE_BROWSER_DETAILS', result.stderr)
                self.assertEqual(len(state['navigation']), 0 if mode == 'sandbox-error' else 2 if mode == 'repeated' else 1)
                self.assertEqual(len(state['screenshots']), 1 if mode == 'screenshot-error' else 0)
                self.assertEqual(state['browserClosed'], 0 if mode == 'sandbox-error' else 1)
                self.assertEqual(state['pageClosed'], 0 if mode == 'sandbox-error' else 1)

    def test_capture_worker_requires_sandbox_even_when_host_requests_disabled(self):
        directory = self.root / 'worker'
        (directory / 'web_capture').mkdir(parents=True)
        worker = directory / 'web_capture' / 'capture.mjs'
        worker.write_text((ROOT / 'web_capture' / 'capture.mjs').read_text())
        (directory / 'hyperframes-runtime.mjs').write_text('''
import { mkdir, writeFile } from 'node:fs/promises'
export async function runHyperframes(args, directory, extra) {
  await writeFile(directory + '/environment.json', JSON.stringify(extra))
  await mkdir(args[args.indexOf('--output') + 1])
  return { stdout: JSON.stringify({ ok: true, httpStatus: 200, screenshots: 1 }) }
}
''')
        result = subprocess.run(['node', str(worker), 'http://192.0.2.10:3128', 'https://example.com/',
                                 str(directory / 'capture'), '2'], capture_output=True, text=True,
                                env={**os.environ, 'HYPERFRAMES_CHROME_SANDBOX': '0'}, timeout=10)
        self.assertEqual(result.returncode, 0)
        environment = json.loads((directory / 'environment.json').read_text())
        self.assertEqual(environment.get('HYPERFRAMES_CHROME_SANDBOX'), '1')

    def test_capture_reports_sandbox_environment_failure_without_publishing(self):
        module = load('web_capture')

        def unavailable(_args, _timeout, workspace):
            (workspace / 'capture-error.json').write_text(json.dumps({'code': 'SANDBOX_UNAVAILABLE'}))
            raise ToolError('TOOL_FAILED', 'The selected operation failed')

        with patch.dict(os.environ, {'HAI_TOOL_BROWSER_PROXY': 'http://192.0.2.10:3128'}, clear=True):
            with patch.object(module, 'run_command', unavailable):
                result = self.invoke(module, {'operation': 'web.capture', 'url': 'https://example.com/', 'output': 'capture.zip'})
        self.assertFalse(result['success'])
        self.assertEqual(result['error']['code'], 'SANDBOX_UNAVAILABLE')
        self.assertEqual(list(self.outputs.iterdir()), [])

    def test_capture_worker_keeps_only_fixed_sandbox_error_code(self):
        for index, message in enumerate([
            'No usable sandbox! Internal private details',
            'Check failed: sys_chroot("/proc/self/fdinfo/") == 0; Zygote process exited prematurely',
        ]):
            with self.subTest(message=message):
                directory = self.root / f'rejected-worker-{index}'
                (directory / 'web_capture').mkdir(parents=True)
                worker = directory / 'web_capture' / 'capture.mjs'
                worker.write_text((ROOT / 'web_capture' / 'capture.mjs').read_text())
                (directory / 'hyperframes-runtime.mjs').write_text(
                    'export async function runHyperframes() { const error = new Error("Capture failed"); '
                    + 'error.stdout = ' + json.dumps(json.dumps({'error': {'message': message}}))
                    + '; throw error }')
                result = subprocess.run(['node', str(worker), 'http://192.0.2.10:3128', 'https://example.com/',
                                         str(directory / 'capture'), '2'], capture_output=True, text=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(json.loads((directory / 'capture-error.json').read_text()), {'code': 'SANDBOX_UNAVAILABLE'})
                self.assertNotIn('Internal private details', result.stderr)

    def test_capture_does_not_misclassify_page_errors_as_sandbox(self):
        directory = self.root / 'page-error-worker'
        (directory / 'web_capture').mkdir(parents=True)
        worker = directory / 'web_capture' / 'capture.mjs'
        worker.write_text((ROOT / 'web_capture' / 'capture.mjs').read_text())
        message = 'Website capture blocked: HTTP 403 title "No usable sandbox"'
        phase = 'HYPERFRAMES_CAPTURE_PHASE {"phase":"browser","status":"completed"}'
        (directory / 'hyperframes-runtime.mjs').write_text(
            'export async function runHyperframes() { const error = new Error("Capture failed"); '
            + 'error.stdout = ' + json.dumps(json.dumps({'error': {'message': message}}))
            + '; error.stderr = ' + json.dumps(phase) + '; throw error }')
        result = subprocess.run(['node', str(worker), 'http://192.0.2.10:3128', 'https://example.com/',
                                 str(directory / 'capture'), '2'], capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((directory / 'capture-error.json').exists())

    def test_capture_retries_only_one_transient_navigation_with_total_budget(self):
        directory = self.root / 'retry-worker'
        (directory / 'web_capture').mkdir(parents=True)
        worker = directory / 'web_capture' / 'capture.mjs'
        worker.write_text((ROOT / 'web_capture' / 'capture.mjs').read_text())
        (directory / 'hyperframes-runtime.mjs').write_text('''
import { mkdir, writeFile, readFile } from 'node:fs/promises'
export async function runHyperframes(args, directory, extra, timeout) {
  let calls = []; try { calls = JSON.parse(await readFile(directory + '/calls.json', 'utf8')) } catch {}
  calls.push({ timeout, sandbox: extra.HYPERFRAMES_CHROME_SANDBOX })
  await writeFile(directory + '/calls.json', JSON.stringify(calls))
  const output = args[args.indexOf('--output') + 1]
  await mkdir(output, { recursive: true })
  if (calls.length === 1) {
    await writeFile(output + '/BLOCKED.md', 'Old failed output')
    const error = new Error('Navigation failed')
    error.stdout = JSON.stringify({ ok: false, error: { code: 'runtime_error', message: 'net::ERR_NETWORK_CHANGED at https://example.com/' } })
    error.stderr = 'HYPERFRAMES_CAPTURE_PHASE {"phase":"browser","status":"completed"}\\nHYPERFRAMES_CAPTURE_PHASE {"phase":"navigation","status":"started"}'
    throw error
  }
  return { stdout: JSON.stringify({ ok: true, httpStatus: 200, screenshots: 1 }) }
}
''')
        result = subprocess.run(['node', str(worker), 'http://192.0.2.10:3128', 'https://example.com/',
                                 str(directory / 'capture'), '2'], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0)
        calls = json.loads((directory / 'calls.json').read_text())
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(item['sandbox'] == '1' and 0 < item['timeout'] <= 170000 for item in calls))
        self.assertLess(calls[1]['timeout'], calls[0]['timeout'])
        self.assertFalse((directory / 'capture' / 'BLOCKED.md').exists())
        status = json.loads((directory / 'capture' / 'capture-status.json').read_text())
        self.assertEqual(status['retries'], [{'phase': 'navigation', 'code': 'ERR_NETWORK_CHANGED', 'attempt': 1}])

    def test_capture_does_not_retry_http403_or_other_errors_and_never_a_third_attempt(self):
        for index, mode in enumerate(['http403', 'connection-reset', 'network-changed']):
            with self.subTest(mode=mode):
                directory = self.root / f'limited-worker-{index}'
                (directory / 'web_capture').mkdir(parents=True)
                worker = directory / 'web_capture' / 'capture.mjs'
                worker.write_text((ROOT / 'web_capture' / 'capture.mjs').read_text())
                (directory / 'hyperframes-runtime.mjs').write_text('''
import { writeFile, readFile } from 'node:fs/promises'
const mode = MODE
export async function runHyperframes(args, directory) {
  let count = 0; try { count = Number(await readFile(directory + '/count', 'utf8')) } catch {}
  await writeFile(directory + '/count', String(count + 1))
  if (mode === 'http403') return { stdout: JSON.stringify({ ok: true, httpStatus: 403, screenshots: 1 }) }
  const error = new Error('Capture failed')
  error.stdout = JSON.stringify({ ok: false, error: { code: 'runtime_error', message: 'net::' + (mode === 'network-changed' ? 'ERR_NETWORK_CHANGED' : 'ERR_CONNECTION_RESET') + ' at https://example.com/' } })
  error.stderr = 'HYPERFRAMES_CAPTURE_PHASE {"phase":"browser","status":"completed"}\\nHYPERFRAMES_CAPTURE_PHASE {"phase":"navigation","status":"started"}'
  throw error
}
'''.replace('MODE', json.dumps(mode)))
                result = subprocess.run(['node', str(worker), 'http://192.0.2.10:3128', 'https://example.com/',
                                         str(directory / 'capture'), '2'], capture_output=True, text=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(int((directory / 'count').read_text()), 2 if mode == 'network-changed' else 1)
                self.assertFalse((directory / 'capture').exists())

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
            for name in ['AGENTS.md', 'CLAUDE.md', '.cursorrules']:
                (destination / name).write_text('Generated assistant workflow instructions')
            (destination / 'capture-status.json').write_text(json.dumps({
                'httpStatus': 200, 'dropped': {'unavailable': 1}, 'warnings': ['One referenced asset is unavailable'],
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
            self.assertEqual(result['data']['summary']['text'], metadata['text'])
            self.assertEqual(result['data']['summary']['sourceUrl'], metadata['sourceUrl'])
            for name in ['AGENTS.md', 'CLAUDE.md', '.cursorrules']:
                self.assertNotIn(name, archive.namelist())
                self.assertNotIn(name, result['data']['summary']['materials'])
            self.assertEqual(json.loads(archive.read('capture-status.json'))['dropped']['unavailable'], 1)

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

    def test_video_rejects_duplicate_html_attributes_that_browsers_interpret_differently(self):
        module = load('video_render')
        source = self.project(html='<div data-composition-id="intro" data-duration="31" data-duration="4" data-width="1280" data-height="720">Ambiguous duration</div>')
        result = self.invoke(module, {'operation': 'video.render', 'input': source, 'output': 'ambiguous.mp4'})
        self.assertEqual(result['error']['code'], 'INVALID_PROJECT')

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
