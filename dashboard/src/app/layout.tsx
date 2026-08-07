import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "POS-PROBE | Analytics Dashboard",
  description:
    "Predictive Restocking & Outlier Behavior Engine — Manager Analytics Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.className}`}>
        <Providers>
          <ThemeProvider>
            <AuthGuard>
              <AppShell>{children}</AppShell>
            </AuthGuard>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
