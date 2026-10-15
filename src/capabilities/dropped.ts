/*
 * Rules the composed presets or curated tables contain that no engine can run
 * and that we accept losing. Each needs a reason; codegen fails on any other
 * drop so a preset change cannot silently remove a rule.
 */
export const droppedRules: Readonly<Record<string, string>> = {}
