import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rurix | Business Control System",
  description:
    "Rurix helps business owners control sales, payments, stock, staff activity, branches, and daily business risk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
