import path from 'node:path'

export const rootDirectory = path.resolve(import.meta.dirname, '../..')
export const oxlintBinary = path.join(rootDirectory, 'node_modules/.bin/oxlint')
