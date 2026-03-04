"use client";

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Search, FileText, ListTodo, ClipboardList, X, Loader2 } from "lucide-react";
import { api } from "~/trpc/react";

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

const typeIcons: Record<string, React.ReactNode> = {
  meeting: <FileText className="h-4 w-4 text-blue-500" />,
  actionItem: <ListTodo className="h-4 w-4 text-amber-500" />,
  agendaItem: <ClipboardList className="h-4 w-4 text-purple-500" />,
};

const typeLabels: Record<string, string> = {
  meeting: "Meeting",
  actionItem: "Action Item",
  agendaItem: "Agenda Item",
};

export default function NavigationBar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: searchData, isFetching: isSearching } = api.search.globalSearch.useQuery(
    { query: debouncedQuery, limit: 10 },
    { enabled: debouncedQuery.length >= 2 }
  );

  const handleResultClick = useCallback((meetingId: number) => {
    setShowResults(false);
    setSearchQuery("");
    router.push(`/meetings/${meetingId}`);
  }, [router]);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const input = searchRef.current?.querySelector("input");
        input?.focus();
      }
      if (e.key === "Escape") {
        setShowResults(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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

        {/* Search Bar */}
        {session && (
          <div ref={searchRef} className="relative hidden md:block">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search... ⌘K"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => { if (searchQuery.length >= 2) setShowResults(true); }}
                className="h-8 w-[220px] rounded-md border border-input bg-muted/50 pl-8 pr-8 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:bg-background transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setShowResults(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Search Results Dropdown */}
            {showResults && debouncedQuery.length >= 2 && (
              <div className="absolute top-full mt-1 right-0 w-[400px] bg-background border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
                {isSearching ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Searching...
                  </div>
                ) : searchData && searchData.results.length > 0 ? (
                  <div className="py-1">
                    {searchData.results.map((result) => (
                      <button
                        key={`${result.type}-${result.id}`}
                        onClick={() => handleResultClick(result.meetingId)}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors flex items-start gap-3"
                      >
                        <div className="mt-0.5 shrink-0">
                          {typeIcons[result.type]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{result.title}</span>
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                              {typeLabels[result.type]}
                            </span>
                          </div>
                          {result.meetingTitle && result.type !== "meeting" && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              in {result.meetingTitle}
                            </p>
                          )}
                          {result.snippet && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {result.snippet}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    {searchData.total > searchData.results.length && (
                      <div className="px-3 py-2 text-xs text-muted-foreground text-center border-t">
                        Showing {searchData.results.length} of {searchData.total} results
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No results found for &quot;{debouncedQuery}&quot;
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
