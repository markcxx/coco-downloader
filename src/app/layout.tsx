import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorNotifications } from "@/components/ErrorNotifications";

export const metadata: Metadata = {
  title: "COCO音乐下载站",
  description: "简约纯净的音乐下载工具",
  icons: {
    icon: "/logo.svg",
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="sticky top-0 z-[60] w-full flex flex-col">
            <Navbar />
          </div>
          <div className="min-h-screen">{children}</div>
          <ErrorNotifications />
        </ThemeProvider>
      </body>
    </html>
  );
}
