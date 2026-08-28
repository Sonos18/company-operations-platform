const blockedPostLoginPathnames = new Set([
  '/login',
  '/forgot-password',
  '/auth/callback',
  '/reset-password',
])
const encodedUnsafePathCharacter = /%(?:0[0-9a-f]|1[0-9a-f]|7f|2f|5c)/i
const maximumPathDecodingPasses = 4

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function isBlockedPostLoginPath(pathname: string): boolean {
  return [...blockedPostLoginPathnames].some(path => pathname === path || pathname.startsWith(`${path}/`))
}

function decodePathname(pathname: string): string | null {
  let decodedPathname = pathname

  for (let pass = 0; pass < maximumPathDecodingPasses; pass += 1) {
    let nextPathname: string
    try {
      nextPathname = decodeURIComponent(decodedPathname)
    }
    catch {
      return null
    }

    if (nextPathname === decodedPathname) {
      return hasControlCharacter(decodedPathname)
        || decodedPathname.includes('\\')
        || decodedPathname.startsWith('//')
        ? null
        : decodedPathname
    }
    decodedPathname = nextPathname
  }

  return null
}

export function parseCanonicalAppUrl(value: string): URL {
  if (typeof value !== 'string') throw new TypeError('App URL must be a string.')

  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new TypeError('App URL must be an absolute URL.')
  }

  const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(isLocalHost && url.protocol === 'http:')) {
    throw new TypeError('App URL must use HTTPS outside localhost.')
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new TypeError('App URL must be an origin without credentials, query, fragment, or path.')
  }

  return url
}

export function buildAuthCallbackUrl(appUrl: string): string {
  const appOrigin = parseCanonicalAppUrl(appUrl).origin
  return new URL('/auth/callback', appOrigin).toString()
}

export function sanitizeInternalRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (hasControlCharacter(value) || value.includes('\\') || encodedUnsafePathCharacter.test(value)) return null

  let url: URL
  try {
    url = new URL(value, 'https://taskovia.internal')
  }
  catch {
    return null
  }

  const pathname = decodePathname(url.pathname)

  if (url.origin !== 'https://taskovia.internal' || pathname === null || isBlockedPostLoginPath(pathname)) {
    return null
  }

  return value
}
