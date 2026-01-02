import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'KickStar | Canada\'s Sneaker Price Comparison',
  description: 'Find the best sneaker prices across Canadian resellers. Compare StockX, GOAT, Flight Club, and more.',
  keywords: 'sneakers, canada, price comparison, stockx, goat, resell, kicks, jordans, nike, adidas',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="noise-overlay" />
        <div className="grid-bg min-h-screen">
          {children}
        </div>
      </body>
    </html>
  )
}


