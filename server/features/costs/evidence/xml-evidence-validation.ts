/**
 * Allowlist validation for XML invoice evidence (Vietnamese e-invoices).
 *
 * This is NOT the XSS control. XML evidence is stored as application/octet-stream and always
 * signed as a download (shared/utils/evidence-storage-content-type.ts and readEvidenceUrl), so a
 * browser never renders it. This check only keeps documents that look like an e-invoice and
 * nothing else: UTF-8, an optional XML declaration, then exactly one root element from
 * XML_EVIDENCE_ROOT_ELEMENTS, no DOCTYPE/ENTITY, no processing instruction other than the
 * declaration, and only namespaces from XML_EVIDENCE_NAMESPACES. It scans the tag structure
 * without resolving entities or building a DOM.
 */

/** Local names a Vietnamese e-invoice document may use as its root element. */
export const XML_EVIDENCE_ROOT_ELEMENTS: readonly string[] = ['HDon', 'TDiep', 'Invoice']

/** Namespace URIs an e-invoice may declare, compared with the raw attribute value. */
export const XML_EVIDENCE_NAMESPACES: readonly string[] = [
  '',
  'http://www.w3.org/2000/09/xmldsig#',
  'http://www.w3.org/2001/04/xmldsig-more#',
  'http://www.w3.org/2001/04/xmlenc#',
  'http://www.w3.org/2001/XMLSchema',
  'http://www.w3.org/2001/XMLSchema-instance',
  'http://laphoadon.gdt.gov.vn/2014/09/invoicexml/v1',
]

const declarationPattern = /^<\?xml\s+version\s*=\s*(["'])1\.\d\1(?:\s+encoding\s*=\s*(["'])([A-Za-z][\w.-]*)\2)?(?:\s+standalone\s*=\s*(["'])(?:yes|no)\4)?\s*\?>/u
const namePattern = '[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?'
const startTagPattern = new RegExp(`^<(${namePattern})(?=[\\s/>])`, 'u')
const endTagPattern = new RegExp(`^</(${namePattern})\\s*>$`, 'u')
const namespaceDeclarationPattern = /(?:^|\s)xmlns(?::[^\s=/>]*)?\s*=\s*(?:"([^"]*)"|'([^']*)')/gu

// Defense in depth only, applied after decoding numeric character references and &lt;/&gt;.
const forbiddenDecodedPatterns: readonly RegExp[] = [
  /<\s*script/iu,
  /javascript\s*:/iu,
  /<\s*!\s*(?:doctype|entity)/iu,
  /xml-stylesheet/iu,
  /http:\/\/www\.w3\.org\/1999\/xhtml/iu,
  /http:\/\/www\.w3\.org\/2000\/svg/iu,
  /http:\/\/www\.w3\.org\/1998\/math\/mathml/iu,
]

export class XmlEvidenceRejected extends Error {}

function reject(reason: string): never {
  throw new XmlEvidenceRejected(reason)
}

function decodeUtf8(bytes: Uint8Array): string {
  let text: string
  try {
    // fatal: invalid UTF-8 (including a UTF-16 byte order mark) throws; a UTF-8 BOM is dropped.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
  catch {
    return reject('not UTF-8')
  }
  // UTF-16 without a byte order mark decodes as UTF-8 with NUL bytes.
  if (text.includes('\u0000')) reject('NUL byte')
  return text
}

/** Index of the ">" that closes the tag starting at `start`, honouring quoted attribute values. */
function tagEnd(text: string, start: number): number {
  let quote: string | null = null
  for (let index = start + 1; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === quote) quote = null
      else if (char === '<') reject('"<" inside an attribute value')
      continue
    }
    if (char === '"' || char === '\'') quote = char
    else if (char === '<') reject('unterminated tag')
    else if (char === '>') return index
  }
  return reject('unterminated tag')
}

function checkNamespaces(tag: string) {
  const declarations = [...tag.matchAll(namespaceDeclarationPattern)]
  // Every "xmlns" in the tag must be a well-formed declaration with an allowed, unescaped value.
  if (declarations.length !== (tag.match(/xmlns/gu)?.length ?? 0)) reject('malformed namespace declaration')
  for (const declaration of declarations) {
    const value = declaration[1] ?? declaration[2] ?? ''
    if (!XML_EVIDENCE_NAMESPACES.includes(value)) reject(`namespace not allowed: ${value}`)
  }
}

function localName(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.indexOf(':') + 1)
}

/** Walks the markup: one allowed root, balanced tags, comments and CDATA only inside the root. */
function checkElements(text: string, from: number) {
  const open: string[] = []
  let seenRoot = false
  let index = from
  while (index < text.length) {
    const next = text.indexOf('<', index)
    if (open.length === 0) {
      // Outside the root only whitespace is allowed (before it and after it).
      const gap = next < 0 ? text.slice(index) : text.slice(index, next)
      if (gap.trim() !== '') reject('content outside the root element')
      if (seenRoot) {
        if (next >= 0) reject('content after the root element')
        break
      }
    }
    if (next < 0) break
    if (text.startsWith('<!--', next)) {
      if (open.length === 0) reject('comment outside the root element')
      const end = text.indexOf('-->', next + 4)
      if (end < 0) reject('unterminated comment')
      index = end + 3
      continue
    }
    if (text.startsWith('<![CDATA[', next)) {
      if (open.length === 0) reject('CDATA outside the root element')
      const end = text.indexOf(']]>', next + 9)
      if (end < 0) reject('unterminated CDATA')
      index = end + 3
      continue
    }
    // DOCTYPE, ENTITY, any other declaration and every processing instruction.
    if (text[next + 1] === '!' || text[next + 1] === '?') reject('declaration or processing instruction')
    const end = tagEnd(text, next)
    const tag = text.slice(next, end + 1)
    if (tag.startsWith('</')) {
      const closing = endTagPattern.exec(tag)
      if (!closing || open.pop() !== closing[1]) reject('unbalanced end tag')
    }
    else {
      const opening = startTagPattern.exec(tag)
      if (!opening) reject('malformed start tag')
      const name = opening[1]!
      if (open.length === 0) {
        if (seenRoot) reject('second root element')
        if (!XML_EVIDENCE_ROOT_ELEMENTS.includes(localName(name))) reject(`root element not allowed: ${name}`)
        seenRoot = true
      }
      checkNamespaces(tag)
      if (!tag.endsWith('/>')) open.push(name)
    }
    index = end + 1
  }
  if (!seenRoot) reject('no root element')
  if (open.length > 0) reject('unclosed element')
}

function decodeReferences(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);?/giu, (_match, hex: string) => String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff)))
    .replace(/&#(\d+);?/gu, (_match, decimal: string) => String.fromCodePoint(Math.min(Number.parseInt(decimal, 10), 0x10ffff)))
    .replace(/&lt;?/giu, '<')
    .replace(/&gt;?/giu, '>')
}

/** Throws XmlEvidenceRejected unless the bytes are an allowed XML e-invoice document. */
export function validateXmlEvidence(bytes: Uint8Array): void {
  const text = decodeUtf8(bytes)
  // A UTF-8 BOM is already dropped; tolerate whitespace before the declaration or root.
  const body = text.trimStart()
  let start = text.length - body.length
  const declaration = declarationPattern.exec(body)
  if (declaration) {
    const encoding = declaration[3]
    if (encoding !== undefined && encoding.toLowerCase() !== 'utf-8') reject(`encoding not allowed: ${encoding}`)
    start += declaration[0].length
  }
  else if (body.startsWith('<?')) {
    reject('malformed XML declaration')
  }
  checkElements(text, start)
  const decoded = decodeReferences(text)
  if (forbiddenDecodedPatterns.some(pattern => pattern.test(decoded))) reject('active content')
}
