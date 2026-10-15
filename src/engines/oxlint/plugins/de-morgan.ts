import plugin from 'eslint-plugin-de-morgan'
import type { ESLint } from 'eslint'
import { unwrapPlugin } from '../../eslint/unwrap.ts'

const shim: ESLint.Plugin = unwrapPlugin(plugin)

export default shim
