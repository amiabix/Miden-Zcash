import type { Metadata } from "next";
import { Inter, DM_Mono, Geist } from "next/font/google";
import localfont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Navbar } from "@/components/navbar";
import { MidenSdkProvider } from "@/providers/sdk-provider";
import { BackgroundProcesses } from "@/components/background-process";
import { BalanceProvider } from "@/providers/balance-provider";
import { TransactionProviderC } from "@/providers/transaction-provider";
import { Toaster } from "sonner";
import { WebRtcProvider } from "@/providers/webrtc-provider";
import { ReceiverProvider } from "@/providers/receiver-provider";
import { Footer } from "@/components/footer";
import { KeyExportProvider } from "@/lib/zcash/keyExportContext";
import { ZcashProvider } from "@/providers/zcash-provider";

// Disable static generation for this layout due to SDK pre-render issues
export const revalidate = 0;

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

const giest = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const departureMono = localfont({
  src: "./DepartureMono-Regular.woff2",
  variable: "--font-departure-mono",
});

export const metadata: Metadata = {
  title: "Miden Web Wallet",
  description: "A web wallet for interacting with the Miden blockchain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/miden_wallet_logo_centered.svg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Hide nextjs-portal immediately before React hydrates
                function hidePortal() {
                  const portals = document.querySelectorAll('nextjs-portal, [nextjs-portal]');
                  portals.forEach(portal => {
                    if (portal) {
                      portal.style.display = 'none';
                      portal.style.visibility = 'hidden';
                      portal.style.opacity = '0';
                      portal.style.pointerEvents = 'none';
                      portal.style.position = 'fixed';
                      portal.style.top = '-9999px';
                      portal.style.left = '-9999px';
                      portal.style.width = '0';
                      portal.style.height = '0';
                      portal.style.zIndex = '-999999';
                    }
                  });
                }
                // Run immediately
                hidePortal();
                // Also run on DOMContentLoaded and after a short delay
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', hidePortal);
                }
                setTimeout(hidePortal, 0);
                setTimeout(hidePortal, 10);
                setTimeout(hidePortal, 100);
                // Watch for new portals being added
                const observer = new MutationObserver(hidePortal);
                if (document.body) {
                  observer.observe(document.body, { childList: true, subtree: true });
                } else {
                  document.addEventListener('DOMContentLoaded', () => {
                    observer.observe(document.body, { childList: true, subtree: true });
                  });
                }
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${mono.variable} ${giest.variable} ${departureMono.variable} antialiased min-h-screen flex flex-col bg-white bg-[linear-gradient(to_right,#80808007_1px,transparent_1px),linear-gradient(to_bottom,#80808007_1px,transparent_1px)] bg-[size:24px_24px]`}
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="light">
          <MidenSdkProvider>
            <KeyExportProvider>
              <ZcashProvider>
                <BalanceProvider>
                  <TransactionProviderC>
                    <WebRtcProvider>
                      <ReceiverProvider>
                        <BackgroundProcesses />
                        <Navbar />
                        <main className="flex-1">{children}</main>
                        <Footer />
                        <Toaster />
                      </ReceiverProvider>
                    </WebRtcProvider>
                  </TransactionProviderC>
                </BalanceProvider>
              </ZcashProvider>
            </KeyExportProvider>
          </MidenSdkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
