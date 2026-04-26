import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TG Monitor - Telegram Takip Paneli",
  description: "Telegram gruplarini izleyen ve AI ile analiz eden yonetim paneli",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TG Monitor",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#030712" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TG Monitor" />
        <link rel="apple-touch-icon" href="/pwa-icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/pwa-icons/icon-152.png" />
        <link rel="apple-touch-icon" sizes="144x144" href="/pwa-icons/icon-144.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/pwa-icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/pwa-icons/icon-512.png" />
        {/* Tum fetch isteklerine otomatik x-session-token header'i ekler.
            Sayfa render edilmeden once calistigi icin ilk fetch'leri de yakalar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  if (typeof window === 'undefined' || window.__tgFetchPatched) return;
  window.__tgFetchPatched = true;
  var orig = window.fetch.bind(window);
  window.fetch = function(input, init){
    try {
      init = init || {};
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf('/api/') === 0 || url.indexOf(window.location.origin + '/api/') === 0) {
        var tok = '';
        try { tok = localStorage.getItem('tg_session_token') || ''; } catch(e){}
        if (tok) {
          var h = init.headers || {};
          if (h instanceof Headers) {
            if (!h.has('x-session-token')) h.set('x-session-token', tok);
          } else if (Array.isArray(h)) {
            var has = h.some(function(e){ return e[0] && e[0].toLowerCase() === 'x-session-token'; });
            if (!has) h.push(['x-session-token', tok]);
          } else {
            if (!h['x-session-token']) h['x-session-token'] = tok;
          }
          init.headers = h;
        }
      }
    } catch(e){}
    return orig(input, init);
  };
})();
`,
          }}
        />
      </head>
      <body className="min-h-full bg-gray-950 text-gray-100">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
