import type { Metadata } from "next";
import localFont from "next/font/local";
import {
  DM_Sans,
  IBM_Plex_Sans,
  Inter,
  Manrope,
  Outfit,
  Plus_Jakarta_Sans,
  Public_Sans,
  Source_Sans_3,
  Space_Grotesk,
  Work_Sans,
} from "next/font/google";
import "./globals.css";

const nohemi = localFont({
  src: "./fonts/Nohemi-VF.ttf",
  variable: "--font-nohemi",
  display: "swap",
});

const sec1 = Inter({ subsets: ["latin"], variable: "--font-sec-1" });
const sec2 = Manrope({ subsets: ["latin"], variable: "--font-sec-2" });
const sec3 = Space_Grotesk({ subsets: ["latin"], variable: "--font-sec-3" });
const sec4 = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-sec-4",
});
const sec5 = Source_Sans_3({ subsets: ["latin"], variable: "--font-sec-5" });
const sec6 = Public_Sans({ subsets: ["latin"], variable: "--font-sec-6" });
const sec7 = Work_Sans({ subsets: ["latin"], variable: "--font-sec-7" });
const sec8 = DM_Sans({ subsets: ["latin"], variable: "--font-sec-8" });
const sec9 = Outfit({ subsets: ["latin"], variable: "--font-sec-9" });
const sec10 = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sec-10",
});
const secFonts = [sec1, sec2, sec3, sec4, sec5, sec6, sec7, sec8, sec9, sec10];

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
