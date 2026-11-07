import type { PropsWithChildren } from 'react';

/**
 * Web document shell (Expo Router static rendering). Only used by the browser build; the
 * Android/iOS builds ship `app.json` metadata instead. Keeps the tab title and theme colour
 * consistent with the college portal.
 */
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#123c78" />
        <meta name="description" content="BITS Kurnool mobile app — attendance, notices, and parent communication for Brindavan Institute of Technology & Science." />
        <title>BITS Kurnool | College Management</title>
        <style dangerouslySetInnerHTML={{ __html: 'body{background:#f4f7fb;}' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
