import './globals.css'
import { ClientLayout } from './client-layout'

export const metadata = {
  title: 'ExamPro Admin',
  description: 'Question bank management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
