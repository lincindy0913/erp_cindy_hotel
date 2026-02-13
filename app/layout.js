import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: '進銷存暨營運決策分析系統',
  description: 'ERP Inventory Management System',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📊</text></svg>',
  },
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

