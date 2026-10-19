import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import './globals.css';

const siteOrigin = (env as unknown as { SITE_URL?: string }).SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: 'Survivor Week 7 Tiebreaker',
  description: 'Private Week 7 NFL pick entry and live tiebreaker standings.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
