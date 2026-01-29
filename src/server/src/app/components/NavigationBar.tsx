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
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl flex h-14 items-center justify-between">
        {/* Logo and Nav */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Isha"
              width={32}
              height={28}
              className="shrink-0"
            />
            <span className="font-semibold text-sm hidden sm:block">
              MeetingBot
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
                    "px-3 py-1.5 rounded-md text-sm transition-colors",
                    isActive
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
            <span className="text-xs font-medium bg-primary text-primary-foreground px-2 py-1 rounded-md">
              Admin
            </span>
          )}
          {isGC && (
            <span className="text-xs font-medium bg-emerald-600 text-white px-2 py-1 rounded-md">
              GC
            </span>
          )}
          <SessionButton />
        </div>
      </div>
    </header>
  );
}
