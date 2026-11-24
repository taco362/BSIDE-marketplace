import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "B-SIDE",
  description: "독립 아티스트 굿즈 재판매와 창작자 수익 환원을 지원하는 NFT 기반 중고거래 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              B-SIDE
            </Link>
            <ConnectButton />
          </div>
        </header>
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</div>
      </body>
    </html>
  );
}
