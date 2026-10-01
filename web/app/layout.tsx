import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Umuburo AI — Malaria Surveillance Signals",
  description:
    "Flags unusual malaria surveillance signals from weekly district data — baseline comparison, anomaly detection and explainable alerts for the health team to verify.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{
            style: {
              background: "#101a2e",
              border: "1px solid #1e2a44",
              color: "#e8eef9",
            },
          }}
        />
      </body>
    </html>
  );
}
