// app/layout.tsx
import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ISAY Fried Chicken System",
    template: "%s | ISAY Fried Chicken System",
  },
  description: "Inventory, sales, delivery, and bodega management system.",
  applicationName: "ISAY Fried Chicken System",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
