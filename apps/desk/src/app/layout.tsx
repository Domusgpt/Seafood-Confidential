import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/source-sans-3';
import './tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Operations desk · Seafood Confidential', template: '%s · Seafood Confidential desk' },
  description: 'Private editorial operations for Seafood Confidential.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'same-origin',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#102B3A' },
    { media: '(prefers-color-scheme: dark)', color: '#0B202C' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
