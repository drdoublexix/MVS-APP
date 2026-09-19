import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover"
        />
        <meta name="theme-color" content="#08111F" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MVS" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon.png" />
        <style>{`
          html, body, #root {
            overscroll-behavior-y: none;
            background-color: #08111F;
          }

          body {
            margin: 0;
            -webkit-text-size-adjust: 100%;
          }

          input, textarea, select {
            font-size: 16px !important;
          }
        `}</style>
      </head>
      <body style={{ margin: 0 }}>
        <ScrollViewStyleReset />
        {children}
      </body>
    </html>
  );
}
