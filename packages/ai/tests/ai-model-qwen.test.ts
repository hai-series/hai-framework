/** 仅启动Python参数桥接，替换execvp，不加载vLLM/模型或发起网络请求。 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const server = fileURLToPath(new URL('../models/images/qwen3-4b/server.py', import.meta.url))
const python = process.platform === 'win32'
  ? 'python'
  : 'python3'

it('qwen把统一认证变量交给vLLM环境，启动参数与日志不包含密钥', () => {
  const marker = 'synthetic-owned-model-auth'
  const script = `import importlib.util,json,os,sys
spec=importlib.util.spec_from_file_location("owned_qwen",sys.argv[1])
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
def execute(program,args):
    print(json.dumps({"environment_matches":os.environ.get("VLLM_API_KEY")==os.environ["HAI_MODEL_API_KEY"],"argv_contains_key":any(os.environ["HAI_MODEL_API_KEY"] in item for item in args)}))
os.execvp=execute
module.main()
`
  const output = execFileSync(python, ['-B', '-c', script, server], {
    env: {
      ...process.env,
      HAI_MODEL_API_KEY: marker,
      VLLM_USE_MODELSCOPE: 'false',
      VLLM_EXTRA_ARGS: '',
    },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  })
  expect(output).not.toContain(marker)
  expect(JSON.parse(output.trim().split(/\r?\n/).at(-1) ?? '{}')).toEqual({ environment_matches: true, argv_contains_key: false })
})

it.each([
  '--api-key synthetic-argument-key',
  '--api-key=synthetic-argument-key',
  '--api_key synthetic-argument-key',
  '--api_key=synthetic-argument-key',
  '--api-k synthetic-argument-key',
  '--api-k=synthetic-argument-key',
  '--api_k synthetic-argument-key',
  '--api_k=synthetic-argument-key',
  '--api-ke synthetic-argument-key',
])('qwen拒绝从额外命令参数注入明文API密钥：%s', (extraArgs) => {
  const script = `import importlib.util,sys
spec=importlib.util.spec_from_file_location("owned_qwen",sys.argv[1])
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
try:
    module.build_args()
except ValueError as error:
    print(str(error))
else:
    raise RuntimeError("Credential argument was accepted")
`
  const output = execFileSync(python, ['-B', '-c', script, server], {
    env: { ...process.env, VLLM_USE_MODELSCOPE: 'false', VLLM_EXTRA_ARGS: extraArgs },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  })
  expect(output).toContain('HAI_MODEL_API_KEY')
  expect(output).not.toContain('synthetic-argument-key')
})

it('qwen保留普通vLLM参数和单独的选项分隔符', () => {
  const script = `import importlib.util,json,sys
spec=importlib.util.spec_from_file_location("owned_qwen",sys.argv[1])
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
print(json.dumps(module.build_args()[-6:]))
`
  const output = execFileSync(python, ['-B', '-c', script, server], {
    env: { ...process.env, VLLM_USE_MODELSCOPE: 'false', VLLM_EXTRA_ARGS: '--max-model-len 4096 --dtype float16 --api-server-count=2 --' },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  })
  expect(JSON.parse(output)).toEqual([
    '--max-model-len',
    '4096',
    '--dtype',
    'float16',
    '--api-server-count=2',
    '--',
  ])
})
