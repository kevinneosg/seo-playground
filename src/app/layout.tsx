import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// LT Energy — SBA display/heading face (condensed, bold, athletic)
const ltEnergy = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../../public/fonts/lt-energy/LTEnergy-NarrowBold.otf", weight: "700", style: "normal" },
    { path: "../../public/fonts/lt-energy/LTEnergy-WideBold.otf", weight: "800", style: "normal" },
  ],
});

// Satoshi — SBA body/UI face
const satoshi = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    { path: "../../public/fonts/satoshi/Satoshi-Regular.otf", weight: "400", style: "normal" },
    { path: "../../public/fonts/satoshi/Satoshi-Medium.otf", weight: "500", style: "normal" },
    { path: "../../public/fonts/satoshi/Satoshi-Bold.otf", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Scholar Basketball — SEO Intelligence",
  description: "SBA SEO dashboard powered by DataForSEO",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ltEnergy.variable} ${satoshi.variable} h-full antialiased`}
    >
      <head>
        {/* Anti-FOUC: apply theme before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            const t = localStorage.getItem('theme');
            if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          } catch {}
        `}} />
      </head>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
