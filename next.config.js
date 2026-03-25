/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // App Router 已在 Next.js 14+ 穩定版內建，無需 experimental 設定

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Content Security Policy — restrictive default, allow same-origin scripts/styles
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires unsafe-inline/eval for dev; tighten with nonce in prod
              "style-src 'self' 'unsafe-inline'",                  // CSS-in-JS requires unsafe-inline
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",                            // Prevent clickjacking (replaces X-Frame-Options)
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Clickjacking protection (legacy fallback for older browsers)
          { key: 'X-Frame-Options', value: 'DENY' },
          // HTTPS enforcement (enable in production behind TLS proxy)
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
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

