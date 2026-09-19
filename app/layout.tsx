import type { Metadata } from "next";
import localFont from "next/font/local";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Agentation } from "agentation";
import "./globals.css";

/** Annotation toolbar: local dev and Vercel preview only, never production. */
const feedback =
  process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "preview";

const nohemi = localFont({
  src: "./fonts/Nohemi-VF.ttf",
  variable: "--font-nohemi",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-secondary",
});
const secFonts = [jakarta];

export const metadata: Metadata = {
  title: "CMSy",
  description: "Code-connected content and component management for AI-built codebases.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nohemi.variable} ${secFonts.map((f) => f.variable).join(" ")} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {feedback && <Agentation />}
      </body>
    </html>
  );
}
