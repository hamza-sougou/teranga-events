import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-archivo',
});

export const metadata: Metadata = {
  title: 'Zen Events',
  description: 'Billetterie événementielle',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={archivo.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
