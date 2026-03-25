// CSRF protection via Origin/Referer header validation
// For JWT-based SPA auth, Origin checking is the recommended approach
// (no cookie-based tokens needed since session is JWT in httpOnly cookie)

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Validate that the request Origin matches the expected host.
 * Returns { ok: true } or { ok: false, reason: string }
 */
function validateCsrf(request) {
  const method = request.method?.toUpperCase();

  // Safe methods don't need CSRF validation
  if (!STATE_CHANGING_METHODS.has(method)) {
    return { ok: true };
  }

  // Allow requests with no origin only if they have the correct content-type
  // (form submissions from other origins will have Origin header)
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // If neither Origin nor Referer is present, this could be a same-origin
  // fetch or a server-side call — allow only if content-type is JSON
  // (browsers don't send application/json from cross-origin forms)
  if (!origin && !referer) {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType === '') {
      return { ok: true };
    }
    return { ok: false, reason: 'Missing Origin header on state-changing request' };
  }

  // Extract host from the request URL
  const requestUrl = new URL(request.url);
  const expectedHost = requestUrl.host; // includes port

  // Validate Origin
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host !== expectedHost) {
        return { ok: false, reason: `Origin mismatch: ${originUrl.host} != ${expectedHost}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Invalid Origin header' };
    }
  }

  // Fallback to Referer validation
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.host !== expectedHost) {
        return { ok: false, reason: `Referer mismatch: ${refererUrl.host} != ${expectedHost}` };
      }
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Invalid Referer header' };
    }
  }

  return { ok: false, reason: 'CSRF validation failed' };
}

module.exports = { validateCsrf, STATE_CHANGING_METHODS };
