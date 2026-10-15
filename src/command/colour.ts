/*
 * One colour decision for both engines. Node's rule, the one ESLint's own
 * formatters follow, decides; Oxlint is told the outcome, because its own
 * rule (1.87) ignores FORCE_COLOR=0, NODE_DISABLE_COLORS and TERM=dumb and
 * has no flag.
 */
import { styleText } from 'node:util'

/**
 * `--color`/`--no-color` when given; otherwise FORCE_COLOR, then NO_COLOR,
 * NODE_DISABLE_COLORS and TERM=dumb, then whether stdout is a terminal.
 */
export const wantsColour = (flag: boolean | undefined): boolean =>
  flag ?? styleText('red', '.', { stream: process.stdout }) !== '.'

// the FORCE_COLOR values Node reads as "colour on"
const FORCING = new Set(['', '1', '2', '3', 'true'])

/**
 * Oxlint's environment carrying the decision. Oxlint honours NO_COLOR and
 * lets FORCE_COLOR beat it, so the variables that would contradict the
 * decision are dropped (Node also warns when NO_COLOR or NODE_DISABLE_COLORS
 * meet FORCE_COLOR); FORCE_COLOR at a terminal leaves its output unchanged.
 */
export const colourEnvironment = (
  colour: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
  const result = { ...environment }

  if (colour) {
    delete result.NO_COLOR
    delete result.NODE_DISABLE_COLORS
    result.FORCE_COLOR =
      result.FORCE_COLOR !== undefined && FORCING.has(result.FORCE_COLOR) ? result.FORCE_COLOR : '1'
  } else {
    delete result.FORCE_COLOR
    result.NO_COLOR = '1'
  }

  return result
}
