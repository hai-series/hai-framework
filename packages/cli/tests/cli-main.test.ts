import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface RegisteredCommand {
  action?: (...args: unknown[]) => Promise<void> | void
  aliases: string[]
  description: string
  name: string
  options: string[]
}

const commandMocks = vi.hoisted(() => ({
  addModule: vi.fn(),
  buildCommand: vi.fn(),
  createProject: vi.fn(),
  deployCommand: vi.fn(),
  generate: vi.fn(),
  initProject: vi.fn(),
}))

const cliState = vi.hoisted(() => ({
  commands: new Map<string, RegisteredCommand>(),
  outputHelp: vi.fn(),
  parse: vi.fn(() => ({ options: {} })),
}))

function createCliMock() {
  const cli = {
    matchedCommand: true,
    option: vi.fn(() => cli),
    command: vi.fn((name: string, description: string) => {
      const registered: RegisteredCommand = {
        aliases: [],
        description,
        name,
        options: [],
      }
      cliState.commands.set(name, registered)

      const commandApi = {
        option: vi.fn((option: string) => {
          registered.options.push(option)
          return commandApi
        }),
        alias: vi.fn((aliasName: string) => {
          registered.aliases.push(aliasName)
          cliState.commands.set(aliasName, registered)
          return commandApi
        }),
        action: vi.fn((handler: RegisteredCommand['action']) => {
          registered.action = handler
          return commandApi
        }),
      }

      return commandApi
    }),
    help: vi.fn(() => cli),
    outputHelp: cliState.outputHelp,
    parse: cliState.parse,
    version: vi.fn(() => cli),
  }

  return cli
}

vi.mock('cac', () => ({
  cac: vi.fn(() => createCliMock()),
}))

vi.mock('../src/commands/cli-commands.js', () => ({
  addModule: commandMocks.addModule,
  buildCommand: commandMocks.buildCommand,
  createProject: commandMocks.createProject,
  deployCommand: commandMocks.deployCommand,
  generate: commandMocks.generate,
  initProject: commandMocks.initProject,
}))

async function loadCliMain() {
  vi.resetModules()
  cliState.commands.clear()
  await import('../src/cli-main.js')
}

function getCommandAction(name: string) {
  const command = cliState.commands.get(name)
  expect(command, `Missing command registration for ${name}`).toBeDefined()
  expect(command?.action, `Missing action handler for ${name}`).toBeDefined()
  return command!.action!
}

beforeEach(async () => {
  await loadCliMain()
})

afterEach(() => {
  vi.clearAllMocks()
  cliState.commands.clear()
})

describe('cli-main', () => {
  it('构建参数完整交给构建器，部署仅暴露一个跳过中间件选项', async () => {
    const options = { cwd: 'C:/workspace', target: 'docker', runtime: 'podman', network: 'pasta', httpProxy: false, sqlitePrebuildMirror: 'http://mirror.internal/sqlite' }
    await getCommandAction('build')(options)
    expect(commandMocks.buildCommand).toHaveBeenCalledWith(options)
    expect(cliState.commands.get('build')!.options).toContain('--network <network>')
    const deployOptions = cliState.commands.get('deploy [appDir]')!.options
    expect(deployOptions).toContain('--skip-middleware')
    expect(deployOptions).not.toContain('--skip-provision')
  })
  it('create 失败设置退出码并让 stderr 完成输出，不强制终止进程', async () => {
    const previousExitCode = process.exitCode
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Forced process exit')
    })
    try {
      commandMocks.createProject.mockRejectedValueOnce(new Error('Install failed'))
      await expect(getCommandAction('create [name]')('failed-create', {})).resolves.toBeUndefined()
      expect(process.exitCode).toBe(1)
      expect(exit).not.toHaveBeenCalled()
    }
    finally {
      process.exitCode = previousExitCode
      exit.mockRestore()
    }
  })

  it('wires create command options to createProject', async () => {
    await getCommandAction('create [name]')('demo-api', {
      cwd: 'C:/workspace',
      examples: false,
      features: 'db,cache',
      frontends: 'web,app',
      git: false,
      install: false,
      packageManager: 'pnpm',
      template: 'custom',
      type: 'api',
      verbose: true,
      yes: true,
    })

    expect(commandMocks.createProject).toHaveBeenCalledWith({
      appType: 'api',
      cwd: 'C:/workspace',
      examples: false,
      features: ['db', 'cache'],
      frontends: ['web', 'app'],
      git: false,
      gitRemote: undefined,
      install: false,
      name: 'demo-api',
      packageManager: 'pnpm',
      template: 'custom',
      verbose: true,
      yes: true,
    })
  })

  it('wires add command to addModule', async () => {
    await getCommandAction('add [module]')('ai', {
      cwd: 'C:/workspace',
      install: false,
      verbose: false,
    })

    expect(commandMocks.addModule).toHaveBeenCalledWith({
      cwd: 'C:/workspace',
      install: false,
      module: 'ai',
      verbose: false,
    })
  })

  it('wires init command to initProject', async () => {
    await getCommandAction('init')({
      cwd: 'C:/workspace',
      force: true,
      verbose: false,
    })

    expect(commandMocks.initProject).toHaveBeenCalledWith({
      cwd: 'C:/workspace',
      force: true,
      verbose: false,
    })
  })

  it('wires generate alias g to generate', async () => {
    await getCommandAction('g')('page', 'dashboard', {
      cwd: 'C:/workspace',
      force: true,
      output: 'src/routes',
      verbose: false,
    })

    expect(commandMocks.generate).toHaveBeenCalledWith({
      cwd: 'C:/workspace',
      force: true,
      name: 'dashboard',
      output: 'src/routes',
      type: 'page',
      verbose: false,
    })
  })

  it.each([
    ['g:page <name>', 'page'],
    ['g:component <name>', 'component'],
    ['g:api <name>', 'api'],
    ['g:model <name>', 'model'],
  ])('wires shortcut %s to generate', async (commandName, expectedType) => {
    await getCommandAction(commandName)('sample-name', { cwd: 'C:/workspace' })

    expect(commandMocks.generate).toHaveBeenCalledWith({
      cwd: 'C:/workspace',
      name: 'sample-name',
      type: expectedType,
    })
  })

  it('passes workspace selection to the generator and its API shortcut', async () => {
    await getCommandAction('g')('api', 'orders', { workspace: 'demo-serv' })
    expect(commandMocks.generate).toHaveBeenLastCalledWith(expect.objectContaining({ workspace: 'demo-serv', type: 'api' }))
    await getCommandAction('g:api <name>')('orders', { workspace: 'apps/service' })
    expect(commandMocks.generate).toHaveBeenLastCalledWith(expect.objectContaining({ workspace: 'apps/service', type: 'api' }))
  })

  it('wires deploy command to deployCommand', async () => {
    await getCommandAction('deploy [appDir]')('apps/demo-serv', {
      cwd: 'C:/workspace',
      skipMiddleware: true,
      verbose: false,
    })

    expect(commandMocks.deployCommand).toHaveBeenCalledWith({
      appDir: 'apps/demo-serv',
      cwd: 'C:/workspace',
      skipMiddleware: true,
      verbose: false,
    })
  })
})
