"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";

import { cn } from "~/lib/utils";
import SessionButton from "./SessionButton";

interface NavItem {
  title: string;
  href: string;
  adminOnly?: boolean;
  gcOnly?: boolean;
  icon?: React.ReactNode;
}

// All navigation items with role flags
const allNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
  },
  {
    title: "Meetings",
    href: "/meetings",
  },
  {
    title: "Calendar",
    href: "/calendar",
    gcOnly: true,
  },
  {
    title: "Attendees",
    href: "/attendees",
    gcOnly: true,
  },
  {
    title: "Action Items",
    href: "/action-items",
    gcOnly: true,
  },
  {
    title: "Agenda Items",
    href: "/agenda-items",
    gcOnly: true,
  },
  {
    title: "API Keys",
    href: "/keys",
    adminOnly: true,
  },
  {
    title: "Bots",
    href: "/bots",
    adminOnly: true,
  },
  {
    title: "Usage",
    href: "/usage",
    adminOnly: true,
  },
  {
    title: "Docs",
    href: "/docs",
    adminOnly: true,
  },
];

export default function NavigationBar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  
  // Check user roles
  const isAdmin = session?.user?.role === "admin";
  const isGC = session?.user?.role === "gc";

  // Filter navigation items based on role
  const navItems = allNavItems.filter((item) => {
    if (item.adminOnly && !isAdmin) {
      return false;
    }
    if (item.gcOnly && !isGC) {
      return false;
    }
    return true;
  });

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl flex h-16 items-center justify-between">
        {/* Logo and Nav */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-xl blur-lg group-hover:bg-primary/30 transition-colors" />
              <div className="relative bg-gradient-to-br from-primary to-primary/80 p-2 rounded-xl shadow-lg shadow-primary/25">
                <Image
                  src="/logo.svg"
                  alt="MeetingBot"
                  width={24}
                  height={24}
                  className="brightness-0 invert"
                />
              </div>
            </div>
            <span className="font-bold text-lg hidden sm:block">
              Meeting<span className="text-primary">Bot</span>
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || 
                (item.href !== "/" && pathname.startsWith(item.href));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Role badges */}
          {isAdmin && (
            <span className="text-xs font-semibold bg-gradient-to-r from-primary to-primary/80 text-primary-foreground px-3 py-1.5 rounded-full shadow-sm">
              Admin
            </span>
          )}
          {isGC && (
            <span className="text-xs font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-3 py-1.5 rounded-full shadow-sm">
              GC
            </span>
          )}
          <SessionButton />
        </div>
      </div>
    </header>
  );
}
