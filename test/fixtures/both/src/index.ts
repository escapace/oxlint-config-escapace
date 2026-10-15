export const repo = { b: 1, a: 2 }

export const unsafe = async (value: Promise<number>): Promise<number> => {
  const result: any = value

  return result
}
