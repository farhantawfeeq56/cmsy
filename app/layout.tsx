import type { Metadata } from "next";
import localFont from "next/font/local";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AnnotationToolbar } from "./annotation-toolbar";
import "./globals.css";

const nohemi = localFont({
  src: "./fonts/Nohemi-VF.ttf",
  variable: "--font-nohemi",
  // Nohemi-VF's `wght` axis spans 100–900. Without the range the generated
  // @font-face defaults to 400 and a bold request is synthesized by the
  // browser rather than interpolated from the axis, which looks smeared.
  weight: "100 900",
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
        <AnnotationToolbar />
      </body>
    </html>
  );
}
