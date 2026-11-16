import importlib.util
import io
import json
import pathlib
import stat
import subprocess
import sys
import tempfile
import unittest
import zipfile
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tool import serve


def load():
    spec = importlib.util.spec_from_file_location('hai_preview_build', ROOT / 'preview_build' / 'operation.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Scripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            self.current = ''

    def handle_data(self, text):
        if self.current is not None:
            self.current += text

    def handle_endtag(self, tag):
        if tag == 'script' and self.current is not None:
            self.scripts.append(self.current)
            self.current = None


class PreviewBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.inputs = self.root / 'input'
        self.outputs = self.root / 'output'
        self.inputs.mkdir()
        self.outputs.mkdir()

    def invoke(self, entries, output='preview.html'):
        with zipfile.ZipFile(self.inputs / 'project.zip', 'w') as archive:
            for name, content in entries.items() if isinstance(entries, dict) else entries:
                archive.writestr(name, content)
        response = io.StringIO()
        serve(io.BytesIO(json.dumps({'operation': 'preview.build', 'input': 'project.zip', 'output': output}).encode()),
              response, load().commands, self.inputs, self.outputs)
        return json.loads(response.getvalue())

    def assert_failure(self, entries, code, output='preview.html'):
        result = self.invoke(entries, output)
        self.assertFalse(result['success'], result)
        self.assertEqual(result['error']['code'], code, result)
        self.assertFalse((self.outputs / output).exists())

    def assert_counter_click(self, html, expected):
        scripts = Scripts()
        scripts.feed(html)
        # VM 只验证产物脚本的一次交互；真实隔离浏览器验收另由 App E2E 执行。
        program = '''
const vm = require('node:vm');
const assert = require('node:assert/strict');
const button = { textContent: '0' };
const context = vm.createContext({ document: { getElementById() { return button; } } });
for (const script of JSON.parse(process.argv[1])) vm.runInContext(script, context, { timeout: 1000 });
button.onclick({ currentTarget: button });
assert.equal(button.textContent, process.argv[2]);
'''
        with (self.root / 'interaction.log').open('w+') as log:
            result = subprocess.run(['node', '-e', program, json.dumps(scripts.scripts), str(expected)],
                                    stdout=log, stderr=log, timeout=10)
            log.seek(0)
            self.assertEqual(result.returncode, 0, log.read())

    def test_builds_vite_style_local_modules_and_css_without_running_project_config(self):
        result = self.invoke({
            'index.html': '<!doctype html><html><head><link rel="stylesheet" href="/src/style.css"></head><body><button id="count">0</button><script type="module" src="/src/main.ts"></script></body></html>',
            'src/main.ts': 'import { next } from "./counter.ts"; document.getElementById("count")!.onclick = event => { event.currentTarget.textContent = String(next()); };',
            'src/counter.ts': 'let count: number = 0; export function next(): number { return ++count; }',
            'src/style.css': '@import "./colors.css"; button { color: var(--accent); }',
            'src/colors.css': ':root { --accent: #123456; }',
            'package.json': '{"scripts":{"build":"exit 99"},"dependencies":{"unrelated-package":"*"}}',
            'vite.config.js': 'throw new Error("Project config must never run");',
            'tsconfig.json': '{"compilerOptions":{"plugins":[{"name":"must-never-load"}]}}',
        })
        self.assertTrue(result['success'], result)
        self.assertEqual(result['data']['artifact']['name'], 'preview.html')
        output = self.outputs / 'preview.html'
        self.assertEqual(result['data']['artifact']['bytes'], output.stat().st_size)
        html = output.read_text()
        self.assertIn('id="count"', html)
        self.assertIn('#123456', html)
        self.assertNotIn('src="/src/main.ts"', html)
        self.assertNotIn('href="/src/style.css"', html)
        self.assertNotIn('must-never-load', html)
        self.assert_counter_click(html, 1)

    def test_rebuild_uses_changed_module_without_previous_result(self):
        entries = {
            'index.html': '<button id="count">0</button><script type="module" src="/src/main.js"></script>',
            'src/main.js': 'import { next } from "./counter.js"; document.getElementById("count").onclick = event => { event.currentTarget.textContent = String(next()); };',
            'src/counter.js': 'export const next = () => 1;',
        }
        first = self.invoke(entries, 'first.html')
        self.assertTrue(first['success'], first)
        self.assert_counter_click((self.outputs / 'first.html').read_text(), 1)
        entries['src/counter.js'] = 'export const next = () => 2;'
        second = self.invoke(entries, 'second.html')
        self.assertTrue(second['success'], second)
        self.assert_counter_click((self.outputs / 'second.html').read_text(), 2)

    def test_ignores_project_package_side_effect_and_browser_resolution_settings(self):
        result = self.invoke({
            'index.html': '<button id="count">0</button><script type="module" src="/main.js"></script>',
            'main.js': 'import "./setup.js";',
            'setup.js': 'document.getElementById("count").onclick = event => { event.currentTarget.textContent = "1"; };',
            'package.json': '{"sideEffects":false,"browser":{"./setup.js":"./wrong.js"}}',
            'wrong.js': 'throw new Error("Project package settings must never be used");',
        })
        self.assertTrue(result['success'], result)
        self.assert_counter_click((self.outputs / 'preview.html').read_text(), 1)

    def test_embeds_local_html_javascript_css_and_svelte_assets(self):
        result = self.invoke({
            'index.html': '<img src="/src/logo.svg"><div id="app"></div><link rel="stylesheet" href="/src/style.css"><script type="module" src="/src/main.ts"></script>',
            'src/main.ts': 'import { mount } from "svelte"; import App from "./App.svelte"; import logo from "./logo.svg"; mount(App, { target: document.getElementById("app")!, props: { logo } });',
            'src/App.svelte': '<script>import { title } from "./label.js"; let { logo } = $props(); let count = $state(0);</script><button onclick={() => count++}>{title}: {count}</button><img src={logo} alt="Logo"><style>button { background-image: url("./logo.svg"); }</style>',
            'src/label.js': 'export const title = "Local Svelte counter";',
            'src/style.css': 'body { background-image: url("./logo.svg"); }',
            'src/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>',
        })
        self.assertTrue(result['success'], result)
        html = (self.outputs / 'preview.html').read_text()
        self.assertIn('Local Svelte counter', html)
        self.assertIn('data:image/svg+xml', html)
        self.assertNotIn('url("./logo.svg")', html)
        self.assertNotIn('from "svelte"', html)

    def test_embeds_svelte_static_src_and_poster_using_component_relative_paths(self):
        result = self.invoke({
            'index.html': '<div id="app"></div><script type="module" src="/src/main.js"></script>',
            'src/main.js': 'import { mount } from "svelte"; import App from "./App.svelte"; mount(App, { target: document.getElementById("app") });',
            'src/App.svelte': '<script>let visible = $state(true);</script>{#if visible}<img src="/src/logo.svg" alt="Logo"><img src={"./nested/poster.svg"} alt="Poster"><video poster="./nested/poster.svg"></video>{/if}',
            'src/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>Root logo</title></svg>',
            'src/nested/poster.svg': '<svg xmlns="http://www.w3.org/2000/svg"><title>Relative poster</title></svg>',
        })
        self.assertTrue(result['success'], result)
        html = (self.outputs / 'preview.html').read_text()
        self.assertTrue('/src/logo.svg' not in html, 'Static component src was not bundled')
        self.assertTrue('./nested/poster.svg' not in html, 'Static component poster was not bundled')
        self.assertIn('data:image/svg+xml;base64,', html)

    def test_rejects_svelte_unsupported_srcset_and_nonlocal_static_assets(self):
        for index, component in enumerate(['<img srcset="/src/logo.svg 1x, /src/logo.svg 2x" alt="Logo">',
                                           '<img src="https://example.com/logo.svg" alt="Logo">',
                                           '<video poster="../../outside.png"></video>']):
            with self.subTest(component=component):
                self.assert_failure({
                    'index.html': '<div id="app"></div><script type="module" src="/main.js"></script>',
                    'main.js': 'import { mount } from "svelte"; import App from "./src/App.svelte"; mount(App, { target: document.getElementById("app") });',
                    'src/App.svelte': component,
                    'src/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                }, 'UNSUPPORTED_PROJECT', f'component-{index}.html')

    def test_rejects_network_dependencies_dynamic_imports_and_escapes(self):
        imports = ['https://example.com/x.js', '//example.com/x.js', 'file:///etc/passwd',
                   '../../outside.js', '/etc/passwd', 'react', 'node:fs', './missing.js', './%2e%2e/%2e%2e/outside.js']
        for name in imports:
            with self.subTest(import_path=name):
                self.assert_failure({'index.html': '<script type="module" src="/main.js"></script>',
                                     'main.js': 'import ' + json.dumps(name) + ';'}, 'UNSUPPORTED_PROJECT')
        self.assert_failure({'index.html': '<script type="module">const name = location.hash; import(name);</script>'}, 'UNSUPPORTED_PROJECT')
        self.assert_failure({'index.html': '<link rel="stylesheet" href="https://example.com/style.css">'}, 'UNSUPPORTED_PROJECT')
        self.assert_failure({'index.html': '<style>body{background:url(//example.com/pixel.png)}</style>'}, 'UNSUPPORTED_PROJECT')
        self.assert_failure({'index.html': '<img src="/src/logo.svg">',
                             'src/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'}, 'UNSUPPORTED_PROJECT')

    def test_rejects_unsafe_zip_entries_and_packaged_dependencies(self):
        link = zipfile.ZipInfo('linked.js')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        cases = [([('../outside.js', 'export default 1')], 'UNSAFE_PROJECT'),
                 ([('.env', 'PRIVATE=value')], 'UNSAFE_PROJECT'),
                 ([('src/App.js', '1'), ('src/app.js', '2')], 'UNSAFE_PROJECT'),
                 ([(link, 'outside.js')], 'UNSAFE_PROJECT'),
                 ([('node_modules/anything/index.js', '1')], 'UNSUPPORTED_PROJECT')]
        for extra, code in cases:
            with self.subTest(entries=extra):
                self.assert_failure([('index.html', '<h1>Hello</h1>')] + extra, code)

    def test_applies_project_source_and_output_budgets(self):
        self.assert_failure({'src/main.js': 'export default 1;'}, 'INVALID_PROJECT')
        self.assert_failure({'index.html': '<h1>Hello</h1>', 'large.js': 'x' * (1024 * 1024 + 1)}, 'UNSAFE_PROJECT')
        self.assert_failure({'index.html': '<h1>Hello</h1>', 'large.png': b'x' * (8 * 1024 * 1024)}, 'UNSAFE_PROJECT')
        self.assert_failure({'index.html': '<img src="/large.png">', 'large.png': b'x' * (800 * 1024)}, 'OUTPUT_LIMIT')


if __name__ == '__main__':
    unittest.main()
