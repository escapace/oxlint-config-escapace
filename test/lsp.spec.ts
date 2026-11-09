/*
 * Editors start `oxlint --lsp` anywhere and root it at the nearest config
 * (nvim-lspconfig) or at the opened folder, so every config that loads must
 * be a root with its type information, and a config inside another config's
 * project must not load.
 */
import { spawn } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { isRecord } from '../src/utilities/is-record.ts'

// every temporary folder of this file lives here and goes when the file is done
const scratch = mkdtempSync(path.join(tmpdir(), 'esclint-lsp-spec-'))

afterAll(() => {
  rmSync(scratch, { force: true, recursive: true })
})

const root = path.resolve(import.meta.dirname, '..')

/** The codes of a `textDocument/diagnostic` result; throws on a result of another shape. */
const diagnosticCodes = (result: unknown): string[] => {
  const items: unknown = isRecord(result) ? (result.items ?? []) : []

  if (!Array.isArray(items)) {
    throw new TypeError(`Expected diagnostic items, got ${JSON.stringify(result)}`)
  }

  return items.map((item: unknown) => {
    if (!isRecord(item) || (item.code !== undefined && typeof item.code !== 'string')) {
      throw new TypeError(`Expected a diagnostic, got ${JSON.stringify(item)}`)
    }

    return String(item.code)
  })
}

/**
 * Opens `file` in an Oxlint language server started in `serverCwd` with
 * `workspace` as its folder and no editor settings, as nvim-lspconfig starts
 * it, and pulls its diagnostics.
 */
const pullDiagnostics = async (
  project: string,
  serverCwd: string,
  file: string,
  workspace = project,
): Promise<{ codes: string[]; log: string }> => {
  const environment: NodeJS.ProcessEnv = { ...process.env, OXC_LOG: 'warn' }

  for (const key of [
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'AI_AGENT',
    'NO_COLOR',
    'FORCE_COLOR',
  ]) {
    delete environment[key]
  }

  const server = spawn(
    process.execPath,
    [path.join(project, 'node_modules/oxlint/bin/oxlint'), '--lsp'],
    {
      cwd: serverCwd,
      env: environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  let log = ''
  server.stderr.on('data', (chunk: Buffer) => {
    log += chunk.toString()
  })
  let buffer = Buffer.alloc(0)
  let id = 0
  const pending = new Map<number, (message: Record<string, unknown>) => void>()
  server.stdout.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk])

    for (;;) {
      const header = buffer.indexOf('\r\n\r\n')

      if (header === -1) {
        return
      }

      const length = Number(
        /Content-Length: (\d+)/.exec(buffer.subarray(0, header).toString())?.[1],
      )

      if (buffer.length < header + 4 + length) {
        return
      }

      const message: unknown = JSON.parse(
        buffer.subarray(header + 4, header + 4 + length).toString(),
      )
      buffer = buffer.subarray(header + 4 + length)

      if (isRecord(message) && typeof message.id === 'number') {
        pending.get(message.id)?.(message)
        pending.delete(message.id)
      }
    }
  })
  const write = (message: object): void => {
    const body = JSON.stringify({ jsonrpc: '2.0', ...message })
    server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }
  const request = async (method: string, parameters: unknown): Promise<Record<string, unknown>> => {
    id += 1
    const requestId = id
    const response = new Promise<Record<string, unknown>>((resolve) =>
      pending.set(requestId, resolve),
    )
    write({ id: requestId, method, params: parameters })

    return await response
  }
  const notify = (method: string, parameters: unknown): void => {
    write({ method, params: parameters })
  }
  const uri = pathToFileURL(file).href
  const rootUri = pathToFileURL(workspace).href

  // Without refresh support Oxlint pushes diagnostics and answers pulls with
  // none (1.90)
  await request('initialize', {
    capabilities: {
      textDocument: { diagnostic: {} },
      workspace: { diagnostics: { refreshSupport: true } },
    },
    initializationOptions: [{ options: {}, workspaceUri: rootUri }],
    processId: process.pid,
    rootUri,
    workspaceFolders: [{ name: 'project', uri: rootUri }],
  })
  notify('initialized', {})
  notify('textDocument/didOpen', {
    textDocument: { languageId: 'typescript', text: readFileSync(file, 'utf8'), uri, version: 1 },
  })
  const pulled = await request('textDocument/diagnostic', { textDocument: { uri } })
  await request('shutdown', {})
  notify('exit', {})
  server.kill()

  return { codes: diagnosticCodes(pulled.result), log }
}

const project = (): string => {
  const directory = mkdtempSync(path.join(scratch, 'esclint-lsp-'))
  cpSync(path.join(root, 'test/fixtures/oxlint-only'), directory, { recursive: true })
  symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  mkdirSync(path.join(directory, 'packages/app/src'), { recursive: true })
  writeFileSync(
    path.join(directory, 'oxlint.config.ts'),
    "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace({ overrides: [{ files: ['packages/app/**'], rules: { 'typescript/no-explicit-any': 'off' } }] })\n",
  )
  writeFileSync(
    path.join(directory, 'packages/app/tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        noEmit: true,
        strict: true,
        target: 'es2024',
        types: [],
      },
      include: ['src'],
    }),
  )
  writeFileSync(
    path.join(directory, 'packages/app/src/b.ts'),
    'export const read = async (value: Promise<number>): Promise<number> => {\n  const result: any = value\n\n  return result\n}\n\nexport const repo = 1\n',
  )

  return directory
}

const packageConfig = (directory: string): void => {
  writeFileSync(
    path.join(directory, 'packages/app/oxlint.config.ts'),
    "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace({ rules: { 'typescript/no-explicit-any': 'off' } })\n",
  )
}

describe('language server', { timeout: 120_000 }, () => {
  it.each([
    ['inside the project', (directory: string) => directory],
    ['outside the project', () => mkdtempSync(path.join(scratch, 'esclint-lsp-cwd-'))],
  ])('lints package files through the root config when started %s', async (_label, cwd) => {
    const directory = project()
    const { codes, log } = await pullDiagnostics(
      directory,
      cwd(directory),
      path.join(directory, 'packages/app/src/b.ts'),
    )

    expect(log).not.toContain('Skipping config file')
    expect(codes.some((code) => code.includes('no-unsafe-return'))).toBe(true)
    expect(codes.some((code) => code.includes('no-explicit-any'))).toBe(false)
  })

  it('gives a package opened as its own folder the root config and its type information', async () => {
    const directory = project()
    const { codes, log } = await pullDiagnostics(
      directory,
      mkdtempSync(path.join(scratch, 'esclint-lsp-cwd-')),
      path.join(directory, 'packages/app/src/b.ts'),
      path.join(directory, 'packages/app'),
    )

    expect(log).not.toContain('Skipping config file')
    expect(codes.some((code) => code.includes('no-unsafe-return'))).toBe(true)
    expect(codes.some((code) => code.includes('no-explicit-any'))).toBe(false)
  })

  it('shows why a package config inside the project is refused, instead of other rules', async () => {
    const directory = project()
    packageConfig(directory)
    const { codes } = await pullDiagnostics(
      directory,
      directory,
      path.join(directory, 'packages/app/src/b.ts'),
      path.join(directory, 'packages/app'),
    )

    expect(codes).toEqual(['esclint(configuration-error)'])
  })

  it('treats package configs as separate projects when no root config exists', async () => {
    const directory = project()
    rmSync(path.join(directory, 'oxlint.config.ts'))
    writeFileSync(path.join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
    packageConfig(directory)
    const { codes, log } = await pullDiagnostics(
      directory,
      mkdtempSync(path.join(scratch, 'esclint-lsp-cwd-')),
      path.join(directory, 'packages/app/src/b.ts'),
      path.join(directory, 'packages/app'),
    )

    expect(log).not.toContain('Skipping config file')
    expect(codes.some((code) => code.includes('no-unsafe-return'))).toBe(true)
    expect(codes.some((code) => code.includes('no-explicit-any'))).toBe(false)
  })

  it('treats a repository the enclosing workspace ignores as its own project', async () => {
    const outer = mkdtempSync(path.join(scratch, 'esclint-lsp-outer-'))
    writeFileSync(path.join(outer, 'pnpm-workspace.yaml'), "packages:\n  - 'repositories/*'\n")
    writeFileSync(path.join(outer, '.lintignore'), 'repositories/**\n')
    writeFileSync(
      path.join(outer, 'oxlint.config.ts'),
      "import { escapace } from 'oxlint-config-escapace'\n\nexport default escapace()\n",
    )
    const directory = path.join(outer, 'repositories/project')
    mkdirSync(path.join(directory, '.git'), { recursive: true })
    cpSync(path.join(root, 'test/fixtures/oxlint-only'), directory, { recursive: true })
    symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
    writeFileSync(
      path.join(directory, 'src/index.ts'),
      'export const read = async (value: Promise<number>): Promise<number> => {\n  const result: any = value\n\n  return result\n}\n',
    )
    const { codes, log } = await pullDiagnostics(
      directory,
      directory,
      path.join(directory, 'src/index.ts'),
    )

    expect(log).not.toContain('Skipping config file')
    expect(codes.some((code) => code.includes('no-unsafe-return'))).toBe(true)
  })
})
