import "~/styles/globals.css";

import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";
import NavigationBar from "./components/NavigationBar";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  title: "MeetingBot",
  description:
    "A user-friendly interface for managing and scheduling meetings effortlessly.",
  icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        <TRPCReactProvider>
          <SessionProvider>
            <div className="relative flex min-h-screen flex-col">
              <NavigationBar />
              <main className="flex-1">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 max-w-7xl">
                  {children}
                </div>
              </main>
              {/* Subtle background decoration */}
              <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
                <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
              </div>
            </div>
          </SessionProvider>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
