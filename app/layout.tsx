import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const nohemi = localFont({
  src: "./fonts/Nohemi-VF.ttf",
  variable: "--font-nohemi",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CMSy",
  description: "Code-connected content and component management for AI-built codebases.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nohemi.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
