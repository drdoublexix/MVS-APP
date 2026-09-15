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
