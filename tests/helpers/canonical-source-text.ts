export function canonicalizeSourceText(source: string): string {
  if (/\r(?!\n)/u.test(source)) throw new Error('Source text contains a bare carriage return')
  return source.replace(/\r\n/g, '\n')
}
