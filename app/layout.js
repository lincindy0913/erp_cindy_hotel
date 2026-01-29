import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: '進銷存暨營運決策分析系統',
  description: 'ERP Inventory Management System',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

