"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu";
import SessionButton from "./SessionButton";

interface NavItem {
  title: string | React.ReactNode;
  href: string;
  target: string;
  adminOnly?: boolean;
  gcOnly?: boolean;
}

// All navigation items with role flags
const allNavItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    target: "_self",
  },
  {
    title: "Meetings",
    href: "/meetings",
    target: "_self",
  },
  {
    title: "Calendar",
    href: "/calendar",
    target: "_self",
    gcOnly: true,
  },
  {
    title: "Attendees",
    href: "/attendees",
    target: "_self",
    gcOnly: true,
  },
  {
    title: "Action Items",
    href: "/action-items",
    target: "_self",
    gcOnly: true,
  },
  {
    title: "Agenda Items",
    href: "/agenda-items",
    target: "_self",
    gcOnly: true,
  },
  {
    title: "API Keys",
    href: "/keys",
    target: "_self",
    adminOnly: true,
  },
  {
    title: "Bots",
    href: "/bots",
    target: "_self",
    adminOnly: true,
  },
  {
    title: "Usage",
    href: "/usage",
    target: "_self",
    adminOnly: true,
  },
  {
    title: "Docs",
    href: "/docs",
    target: "_self",
    adminOnly: true,
  },
];

export default function NavigationBar() {
  const { data: session } = useSession();
  
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
    <div className="flex w-full flex-row items-center justify-between p-2">
      <NavigationMenu className="flex-1">
        <div className="flex items-center">
          <Link href="/">
            <Image
              src="/logo.svg"
              alt="Logo"
              width={32}
              height={32}
              className="mr-2"
            />
          </Link>
          <NavigationMenuList>
            {navItems.map((item, index) => (
              <NavigationMenuItem key={index}>
                <Link href={item.href} legacyBehavior passHref>
                  <NavigationMenuLink
                    className={navigationMenuTriggerStyle()}
                    target={item.target}
                  >
                    {item.title}
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </div>
      </NavigationMenu>
      <div className="flex items-center gap-2">
        {isAdmin && (
          <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
            Admin
          </span>
        )}
        {isGC && (
          <span className="text-xs bg-emerald-600 text-white px-2 py-1 rounded-full">
            GC
          </span>
        )}
        <SessionButton />
      </div>
    </div>
  );
}
