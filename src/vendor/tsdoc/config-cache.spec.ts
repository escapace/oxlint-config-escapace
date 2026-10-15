/*! Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See ./LICENSE for license information.
 */

import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  createConfigCache,
  getConfigForSourceFile,
  type CacheableConfigFile,
} from './config-cache.ts'

interface FakeConfigFile extends CacheableConfigFile {
  key: string
}

const createFakeConfigFile = (key: string, modified = false): FakeConfigFile => ({
  checkForModifiedFiles: vi.fn(() => modified),
  key,
})

const createCache = ({
  cacheCheckIntervalMs = 3000,
  cacheExpireMs = 20_000,
  cacheMaxSize = 100,
  findConfigPathForFolder = vi.fn(() => ''),
  getTimeInMs = vi.fn(() => 0),
  loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath)),
}: Partial<Parameters<typeof createConfigCache<FakeConfigFile>>[0]> = {}) => ({
  cache: createConfigCache<FakeConfigFile>({
    cacheCheckIntervalMs,
    cacheExpireMs,
    cacheMaxSize,
    configFilename: 'tsdoc.json',
    findConfigPathForFolder,
    getTimeInMs,
    loadFile,
  }),
  findConfigPathForFolder,
  getTimeInMs,
  loadFile,
})

describe('getConfigForSourceFile', () => {
  it(
    'uses default configuration discovery when no root directory is supplied',
    { timeout: 60_000 },
    () => {
      expect(
        getConfigForSourceFile(path.join('src', 'vendor', 'tsdoc', 'example.ts')).fileNotFound,
      ).toBe(true)
    },
  )
})

describe('createConfigCache', () => {
  it(
    'uses an explicit tsconfig root directory without probing for configuration',
    { timeout: 60_000 },
    () => {
      const findConfigPathForFolder = vi.fn(() => '')
      const loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath))
      const { cache } = createCache({ findConfigPathForFolder, loadFile })
      const tsConfigRootDirectory = path.join('workspace', 'package')

      const configFile = cache(
        path.join('workspace', 'package', 'src', 'index.ts'),
        tsConfigRootDirectory,
      )

      expect(findConfigPathForFolder).not.toHaveBeenCalled()
      expect(loadFile).toHaveBeenCalledWith(path.join(tsConfigRootDirectory, 'tsdoc.json'))
      expect(configFile.key).toBe(path.join(tsConfigRootDirectory, 'tsdoc.json'))
    },
  )

  it(
    'probes from the source file folder when no explicit tsconfig root directory is provided',
    { timeout: 60_000 },
    () => {
      const foundConfigPath = path.join('workspace', 'tsdoc.json')
      const findConfigPathForFolder = vi.fn(() => foundConfigPath)
      const loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath))
      const { cache } = createCache({ findConfigPathForFolder, loadFile })
      const sourceFilePath = path.join('workspace', 'src', 'index.ts')

      const configFile = cache(sourceFilePath)

      expect(findConfigPathForFolder).toHaveBeenCalledWith(
        path.dirname(path.resolve(sourceFilePath)),
      )
      expect(loadFile).toHaveBeenCalledWith(foundConfigPath)
      expect(configFile.key).toBe(foundConfigPath)
    },
  )

  it(
    'uses the source folder as cache key when no configuration path is found',
    { timeout: 60_000 },
    () => {
      const loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath))
      const { cache } = createCache({ loadFile })
      const sourceFilePath = path.join('workspace', 'src', 'index.ts')

      const firstConfigFile = cache(sourceFilePath)
      const secondConfigFile = cache(sourceFilePath)

      expect(firstConfigFile).toBe(secondConfigFile)
      expect(loadFile).toHaveBeenCalledTimes(1)
      expect(loadFile).toHaveBeenCalledWith('')
    },
  )

  it(
    'returns the cached configuration before the expiration and check intervals elapse',
    { timeout: 60_000 },
    () => {
      let nowMs = 0
      const loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath))
      const { cache } = createCache({ loadFile, getTimeInMs: () => nowMs })
      const sourceFilePath = path.join('workspace', 'src', 'index.ts')

      const firstConfigFile = cache(sourceFilePath)
      nowMs = 1000
      const secondConfigFile = cache(sourceFilePath)

      expect(firstConfigFile).toBe(secondConfigFile)
      expect(firstConfigFile.checkForModifiedFiles).not.toHaveBeenCalled()
      expect(loadFile).toHaveBeenCalledTimes(1)
    },
  )

  it('reloads expired configuration entries', { timeout: 60_000 }, () => {
    let nowMs = 0
    const loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath))
    const { cache } = createCache({ loadFile, getTimeInMs: () => nowMs })
    const sourceFilePath = path.join('workspace', 'src', 'index.ts')

    const firstConfigFile = cache(sourceFilePath)
    nowMs = 21_000
    const secondConfigFile = cache(sourceFilePath)

    expect(firstConfigFile).not.toBe(secondConfigFile)
    expect(loadFile).toHaveBeenCalledTimes(2)
  })

  it(
    'checks old-but-unexpired configuration entries for file modifications',
    { timeout: 60_000 },
    () => {
      let nowMs = 0
      const loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath))
      const { cache } = createCache({ loadFile, getTimeInMs: () => nowMs })
      const sourceFilePath = path.join('workspace', 'src', 'index.ts')

      const firstConfigFile = cache(sourceFilePath)
      nowMs = 4000
      const secondConfigFile = cache(sourceFilePath)

      expect(firstConfigFile).toBe(secondConfigFile)
      expect(firstConfigFile.checkForModifiedFiles).toHaveBeenCalledTimes(1)
      expect(loadFile).toHaveBeenCalledTimes(1)
    },
  )

  it(
    'reloads old-but-unexpired configuration entries when their files changed',
    { timeout: 60_000 },
    () => {
      let nowMs = 0
      const firstLoadedConfigFile = createFakeConfigFile('', true)
      const secondLoadedConfigFile = createFakeConfigFile('', false)
      const loadedConfigFiles = [firstLoadedConfigFile, secondLoadedConfigFile]
      const loadFile = vi.fn(() => loadedConfigFiles.shift()!)
      const { cache } = createCache({ loadFile, getTimeInMs: () => nowMs })
      const sourceFilePath = path.join('workspace', 'src', 'index.ts')

      const firstConfigFile = cache(sourceFilePath)
      nowMs = 4000
      const secondConfigFile = cache(sourceFilePath)

      expect(firstConfigFile).toBe(firstLoadedConfigFile)
      expect(secondConfigFile).toBe(secondLoadedConfigFile)
      expect(firstLoadedConfigFile.checkForModifiedFiles).toHaveBeenCalledTimes(1)
      expect(loadFile).toHaveBeenCalledTimes(2)
    },
  )

  it('clears the cache after the maximum size is exceeded', { timeout: 60_000 }, () => {
    const loadFile = vi.fn((configFilePath: string) => createFakeConfigFile(configFilePath))
    const { cache } = createCache({ cacheMaxSize: 1, loadFile })

    cache(path.join('workspace', 'first', 'index.ts'))
    cache(path.join('workspace', 'second', 'index.ts'))
    cache(path.join('workspace', 'third', 'index.ts'))
    cache(path.join('workspace', 'first', 'index.ts'))

    expect(loadFile).toHaveBeenCalledTimes(4)
  })
})
