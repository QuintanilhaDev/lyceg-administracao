import type { Metadata, Viewport } from 'next';
import './globals.css';
import { WarpProvider } from '@/components/core/Warp';
import { TiltField } from '@/components/core/Tilt';
import { GeoGuard } from '@/components/core/GeoGuard';
import { AuditBeacon } from '@/components/core/AuditBeacon';
import { fxScript } from '@/lib/fxScript';
import { themeScript } from '@/lib/themeScript';
import './fx3d.css';
import './lyceg.css';

export const metadata: Metadata = {
  title: 'Lyceg Administração',
  description: 'Lyceg Administração: setores, frota e almoxarifado em um só lugar, com o Lyco, assistente virtual.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: fxScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <WarpProvider>{children}</WarpProvider>
        <TiltField />
        <GeoGuard />
        <AuditBeacon />
      </body>
    </html>
  );
}
