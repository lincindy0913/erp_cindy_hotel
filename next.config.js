/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',
  // App Router 已在 Next.js 14+ 穩定版內建，無需 experimental 設定
}

module.exports = nextConfig

