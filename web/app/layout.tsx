import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Chess Coach',
  description: 'AI-powered chess coaching from your games',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  )
}
