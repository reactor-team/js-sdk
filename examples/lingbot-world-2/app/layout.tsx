import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LingBot World",
  description: "Steer a generated world with WASD + arrows from a starting image and prompt.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
