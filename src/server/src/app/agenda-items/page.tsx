"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
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
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { api } from "~/trpc/react";
import { 
  ClipboardList, 
  Search,
  Filter,
  LayoutList,
  Table2,
  Kanban,
} from "lucide-react";
import { AgendaItemDetailModal } from "../meetings/components/AgendaItemDetailModal";
import { 
  AgendaListView, 
  AgendaTableView, 
  AgendaKanbanView,
  type AgendaItem,
  statusColors,
} from "./components";

type ViewMode = "list" | "table" | "kanban";

export default function AgendaItemsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Open" | "Closed">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedItem, setSelectedItem] = useState<AgendaItem | null>(null);
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

  const updateMutation = api.agendaItems.update.useMutation({
    onSuccess: () => {
      void utils.agendaItems.getAll.invalidate();
    },
  });

  const handleOpenDetail = (item: AgendaItem) => {
    setSelectedItem(item);
    setDetailModalOpen(true);
  };

  const handleStatusChange = (itemId: number, newStatus: string) => {
    updateMutation.mutate({ id: itemId, status: newStatus as "Open" | "Closed" });
  };

  // Filter agenda items
  let agendaItems = (agendaItemsData?.agendaItems ?? []) as AgendaItem[];
  
  if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    agendaItems = agendaItems.filter(
      (item) =>
        item.description.toLowerCase().includes(searchLower) ||
        (item.ownerName?.toLowerCase().includes(searchLower) ?? false) ||
        (item.meetingTitle?.toLowerCase().includes(searchLower) ?? false)
    );
  }

  if (categoryFilter !== "all") {
    agendaItems = agendaItems.filter((item) => item.category === categoryFilter);
  }

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

  const renderEmptyState = () => (
    <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
      <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-40" />
      <p className="font-medium">No agenda items found</p>
      <p className="text-sm mt-1">Agenda items from your meetings will appear here</p>
    </div>
  );

  const renderView = () => {
    if (agendaItems.length === 0) {
      return renderEmptyState();
    }

    switch (viewMode) {
      case "table":
        return (
          <AgendaTableView
            items={agendaItems}
            onItemClick={handleOpenDetail}
            onStatusChange={handleStatusChange}
          />
        );
      case "kanban":
        return (
          <AgendaKanbanView
            items={agendaItems}
            onItemClick={handleOpenDetail}
            onStatusChange={handleStatusChange}
          />
        );
      case "list":
      default:
        return (
          <AgendaListView
            items={agendaItems}
            onItemClick={handleOpenDetail}
            onStatusChange={handleStatusChange}
          />
        );
    }
  };

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
              <Select value={statusFilter} onValueChange={(v: string) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Policy">Policy</SelectItem>
                  <SelectItem value="Budget Approval">Budget Approval</SelectItem>
                  <SelectItem value="Follow-up">Follow-up</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* View Toggle */}
            <div className="ml-auto">
              <TooltipProvider>
                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(value: string) => value && setViewMode(value as ViewMode)}
                  variant="outline"
                  size="sm"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="list" aria-label="List view">
                        <LayoutList className="h-4 w-4" />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>List view</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="table" aria-label="Table view">
                        <Table2 className="h-4 w-4" />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>Table view</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="kanban" aria-label="Kanban view">
                        <Kanban className="h-4 w-4" />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent>Kanban view</TooltipContent>
                  </Tooltip>
                </ToggleGroup>
              </TooltipProvider>
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
          ) : (
            renderView()
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
