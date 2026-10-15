/*! Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See ./LICENSE for license information.
 */

import * as path from 'node:path'

import { TSDocConfigFile as TSDocumentConfigFile } from '@microsoft/tsdoc-config'

export interface CacheableConfigFile {
  checkForModifiedFiles: () => boolean
}

export interface ConfigCacheOptions<
  ConfigFile extends CacheableConfigFile,
> extends ConfigCacheDependencies<ConfigFile> {
  cacheCheckIntervalMs?: number
  cacheExpireMs?: number
  cacheMaxSize?: number
}

interface CachedConfig<ConfigFile extends CacheableConfigFile> {
  configFile: ConfigFile
  lastCheckTimeMs: number
  loadTimeMs: number
}

interface ConfigCacheDependencies<ConfigFile extends CacheableConfigFile> {
  configFilename: string
  findConfigPathForFolder: (folderPath: string) => string
  getTimeInMs: () => number
  loadFile: (configFilePath: string) => ConfigFile
}

// How often to check for modified input files. If a file's modification timestamp has changed, then the cache
// entry is evicted immediately.
const CACHE_CHECK_INTERVAL_MS = 3 * 1000

// Evict old entries from the cache after this much time, regardless of whether the file was detected as modified.
const CACHE_EXPIRE_MS = 20 * 1000

// If this many objects accumulate in the cache, then it is cleared to avoid a memory leak.
const CACHE_MAX_SIZE = 100

/**
 * Node.js equivalent of performance.now().
 */
const getTimeInMs = (): number => {
  const [seconds, nanoseconds] = process.hrtime()
  return seconds * 1000 + nanoseconds / 1_000_000
}

export const createConfigCache = <ConfigFile extends CacheableConfigFile>({
  cacheCheckIntervalMs = CACHE_CHECK_INTERVAL_MS,
  cacheExpireMs = CACHE_EXPIRE_MS,
  cacheMaxSize = CACHE_MAX_SIZE,
  configFilename,
  findConfigPathForFolder,
  getTimeInMs,
  loadFile,
}: ConfigCacheOptions<ConfigFile>): ((
  sourceFilePath: string,
  tsConfigRootDirectory?: string,
) => ConfigFile) => {
  const cachedConfigs: Map<string, CachedConfig<ConfigFile>> = new Map<
    string,
    CachedConfig<ConfigFile>
  >()

  return (sourceFilePath: string, tsConfigRootDirectory?: string): ConfigFile => {
    const sourceFileFolder = path.dirname(path.resolve(sourceFilePath))

    // First, determine the file to be loaded. If not found, the configFilePath will be an empty string.
    // If the ESLint config has specified where the tsconfig file is, use that path directly without probing the filesystem.
    const configFilePath =
      tsConfigRootDirectory === undefined || tsConfigRootDirectory === ''
        ? findConfigPathForFolder(sourceFileFolder)
        : path.join(tsConfigRootDirectory, configFilename)

    // If configFilePath is an empty string, then use the folder of sourceFilePath as the cache key instead.
    const cacheKey = configFilePath === '' ? `${sourceFileFolder}/` : configFilePath
    const nowMs = getTimeInMs()

    let cachedConfig: CachedConfig<ConfigFile> | undefined = cachedConfigs.get(cacheKey)

    if (cachedConfig !== undefined) {
      // Is the cached object still valid?
      const loadAgeMs = nowMs - cachedConfig.loadTimeMs
      const lastCheckAgeMs = nowMs - cachedConfig.lastCheckTimeMs

      if (loadAgeMs > cacheExpireMs || loadAgeMs < 0) {
        cachedConfig = undefined
        cachedConfigs.delete(cacheKey)
      } else if (lastCheckAgeMs > cacheCheckIntervalMs || lastCheckAgeMs < 0) {
        cachedConfig.lastCheckTimeMs = nowMs
        if (cachedConfig.configFile.checkForModifiedFiles()) {
          // Invalidate the cache because it failed to load completely.
          cachedConfig = undefined
          cachedConfigs.delete(cacheKey)
        }
      }
    }

    // Load the object.
    if (cachedConfig === undefined) {
      if (cachedConfigs.size > cacheMaxSize) {
        cachedConfigs.clear() // Avoid a memory leak.
      }

      cachedConfig = {
        configFile: loadFile(configFilePath),
        lastCheckTimeMs: nowMs,
        loadTimeMs: nowMs,
      }

      cachedConfigs.set(cacheKey, cachedConfig)
    }

    return cachedConfig.configFile
  }
}

// This is the single production cache instance. Keep cache state enclosed here so rule code stays stateless.
const defaultConfigCache = createConfigCache<TSDocumentConfigFile>({
  configFilename: TSDocumentConfigFile.FILENAME,
  getTimeInMs,
  findConfigPathForFolder: (folderPath: string) =>
    TSDocumentConfigFile.findConfigPathForFolder(folderPath),
  loadFile: (configFilePath: string) => TSDocumentConfigFile.loadFile(configFilePath),
})

export const getConfigForSourceFile = (
  sourceFilePath: string,
  tsConfigRootDirectory?: string,
): TSDocumentConfigFile => defaultConfigCache(sourceFilePath, tsConfigRootDirectory)
