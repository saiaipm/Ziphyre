import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { THEME_STORAGE_KEY, themeInitScript } from "@/lib/theme-script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ziphyre",
    template: "%s · Ziphyre",
  },
  description:
    "Hiring automation for small teams. Applications screened, scored and shortlisted in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sets the real theme before first paint — see
            node_modules/next/dist/docs/.../preventing-flash-before-hydration.md.
            next-themes' approach (a script rendered BY a React component)
            is exactly the pattern that guide replaces for this Next
            version; this is a real <script> element instead. */}
        <script
          dangerouslySetInnerHTML={{
            __html: themeInitScript(THEME_STORAGE_KEY),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
