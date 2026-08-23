import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nmg-weltreligionen-training-zug-6.pablorohe.chatgpt.site'),
  title: 'Davids Weltreligionen-Training',
  description: 'Interaktives NMG-Training zur Prüfung Teil 1.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Weltreligionen-Training',
  appleWebApp: { capable: true, title: 'NMG Training', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/images/app-icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/images/app-icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  openGraph: {
    title: 'Weltreligionen-Training',
    description: 'NMG · Prüfung Teil 1',
    images: [{ url: '/images/religionen-og.png', width: 1536, height: 1024 }],
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
