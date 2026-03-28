/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Increase body size limit for large PDF uploads (water/electricity bills can be 50MB+)
  experimental: {
    serverActions: { bodySizeLimit: '100mb' },
    instrumentationHook: true,
  },

  // Disable X-Powered-By header to avoid leaking framework info
  poweredByHeader: false,

  // Security headers
  async headers() {
    const isDev = process.env.NODE_ENV === 'development';

    // Production: remove unsafe-eval (only needed for dev HMR/sourcemaps)
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'";

    const cspDirectives = [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",                  // CSS-in-JS requires unsafe-inline
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",                            // Prevent clickjacking (replaces X-Frame-Options)
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",                                 // Block Flash/Java plugins
    ];

    // Only add upgrade-insecure-requests when behind HTTPS (e.g. Railway)
    // Breaks localhost HTTP — use ENABLE_HTTPS_UPGRADE=true on HTTPS deployments
    if (process.env.ENABLE_HTTPS_UPGRADE === 'true') {
      cspDirectives.push("upgrade-insecure-requests");
    }

    return [
      {
        source: '/(.*)',
        headers: [
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.join('; '),
          },
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Clickjacking protection (legacy fallback for older browsers)
          { key: 'X-Frame-Options', value: 'DENY' },
          // HTTPS enforcement (only useful when behind HTTPS termination)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // Referrer policy — don't leak full URL to third parties
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Permissions policy — disable unused browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
}

module.exports = nextConfig
