import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeScript } from '@/components/layout/theme-script';

export const metadata: Metadata = {
  title: { default: 'NojAds', template: '%s · NojAds' },
  description:
    'Plataforma de gestao, criacao, automacao, publicacao, publicidade, analytics e pagamentos para redes sociais.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f16' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
