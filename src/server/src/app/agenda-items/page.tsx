"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { api } from "~/trpc/react";
import { 
  ClipboardList, 
  Search,
  ExternalLink,
  Filter,
  Clock,
  User,
  MessageSquare,
  Gavel,
  Eye,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { AgendaItemDetailModal } from "../meetings/components/AgendaItemDetailModal";

const statusColors: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800 border-blue-200",
  Closed: "bg-green-100 text-green-800 border-green-200",
};

export default function AgendaItemsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Open" | "Closed">("all");
  const [selectedItem, setSelectedItem] = useState<typeof agendaItems[0] | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const utils = api.useUtils();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/agenda-items");
    }
  }, [status, router]);

  // Check if user has GC role
  const isGC = session?.user?.role === "gc";

  useEffect(() => {
    if (status === "authenticated" && !isGC) {
      router.push("/");
    }
  }, [status, isGC, router]);

  const { 
    data: agendaItemsData, 
    isLoading,
    error,
  } = api.agendaItems.getAll.useQuery(
    { status: statusFilter === "all" ? undefined : statusFilter },
    { enabled: !!session && isGC }
  );

  const handleOpenDetail = (item: typeof agendaItems[0]) => {
    setSelectedItem(item);
    setDetailModalOpen(true);
  };

  // Filter agenda items
  let agendaItems = agendaItemsData?.agendaItems ?? [];
  
  if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    agendaItems = agendaItems.filter(
      (item) =>
        item.description.toLowerCase().includes(searchLower) ||
        (item.ownerName?.toLowerCase().includes(searchLower) ?? false) ||
        item.meetingTitle.toLowerCase().includes(searchLower)
    );
  }

  // Group by meeting
  const groupedItems: Record<number, typeof agendaItems> = {};
  agendaItems.forEach((item) => {
    const group = groupedItems[item.botId];
    if (!group) {
      groupedItems[item.botId] = [item];
    } else {
      group.push(item);
    }
  });

  const openCount = agendaItemsData?.agendaItems?.filter((i) => i.status === "Open").length ?? 0;
  const closedCount = agendaItemsData?.agendaItems?.filter((i) => i.status === "Closed").length ?? 0;

  if (status === "loading") {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session || !isGC) {
    return null;
  }

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-8 w-8" />
            All Agenda Items
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage agenda items across all meetings
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className={statusColors.Open}>
            {openCount} Open
          </Badge>
          <Badge variant="outline" className={statusColors.Closed}>
            {closedCount} Closed
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search agenda items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4 text-red-600">
              Failed to load agenda items: {error.message}
            </div>
          ) : agendaItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="font-medium">No agenda items found</p>
              <p className="text-sm mt-1">Agenda items from your meetings will appear here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedItems).map(([botId, items]) => (
                <div key={botId} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                    <h3 className="font-semibold text-lg">
                      {items[0]?.meetingTitle ?? `Meeting #${botId}`}
                    </h3>
                    <Link href={`/meetings/${botId}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View Meeting
                      </Button>
                    </Link>
                  </div>
                  <div className="divide-y">
                    {items.map((item) => {
                      const hasDetails = item.discussionSummary ?? item.decisionResolution;
                      
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "p-4 hover:bg-muted/30 cursor-pointer transition-colors group",
                            item.status === "Closed" && "bg-muted/20"
                          )}
                          onClick={() => handleOpenDetail(item)}
                        >
                          <div className="flex items-start gap-4">
                            {/* Serial number */}
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                              {item.serialNum}
                            </div>
                            
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <p className={cn(
                                  "font-medium leading-relaxed",
                                  item.status === "Closed" && "line-through text-muted-foreground"
                                )}>
                                  {item.description}
                                </p>
                                <Badge
                                  variant="outline"
                                  className={cn("shrink-0", statusColors[item.status ?? "Open"])}
                                >
                                  {item.status ?? "Open"}
                                </Badge>
                              </div>
                              
                              {/* Meta info row */}
                              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                {item.duration && (
                                  <div className="flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>{item.duration}</span>
                                  </div>
                                )}

                                {item.ownerNames && item.ownerNames.length > 0 ? (
                                  <div className="flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5" />
                                    <span className="truncate max-w-[200px]">
                                      {item.ownerNames.map((o) => o.name).join(", ")}
                                    </span>
                                  </div>
                                ) : item.ownerName && (
                                  <div className="flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5" />
                                    <span>{item.ownerName}</span>
                                  </div>
                                )}

                                {item.dateAdded && (
                                  <span className="text-xs">
                                    Added {format(new Date(item.dateAdded), "MMM d")}
                                  </span>
                                )}

                                {hasDetails && (
                                  <div className="flex items-center gap-2">
                                    {item.discussionSummary && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 text-blue-600">
                                              <MessageSquare className="h-3.5 w-3.5" />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>Has discussion summary</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                    {item.decisionResolution && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="flex items-center gap-1 text-green-600">
                                              <Gavel className="h-3.5 w-3.5" />
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>Has decision/resolution</TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* View button */}
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenDetail(item);
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View details</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <AgendaItemDetailModal
        item={selectedItem}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        showMeetingLink={true}
        onUpdate={() => void utils.agendaItems.getAll.invalidate()}
      />
    </div>
  );
}
