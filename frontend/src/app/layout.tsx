import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Cinzel } from "next/font/google";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { AppWalletProvider } from "@/components/AppWalletProvider";
import Navbar from "@/components/Navbar";
import { Toaster } from "sonner";
import { BackendStatusProvider } from "@/components/BackendStatusProvider";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel" });

export const metadata: Metadata = {
  title: "SwarmCourt | Decentralized AI Debate",
  description: "A decentralized Solana protocol for multi-agent AI debates and reputation.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${cinzel.variable} font-sans overflow-x-hidden`}>
        <AppWalletProvider>
          <BackendStatusProvider>
            <div className="flex flex-col min-h-screen">
              <Navbar />
              <main className="flex-grow p-4 md:p-6 pt-6 md:pt-8 max-w-7xl mx-auto w-full overflow-x-hidden">
                {children}
              </main>
            </div>
          </BackendStatusProvider>
          <Toaster theme="dark" position="bottom-right" />
          <Analytics />
        </AppWalletProvider>
      </body>
    </html>
  );
}
