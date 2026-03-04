"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Calendar as CalendarPicker } from "~/components/ui/calendar";
import { 
  ListTodo, 
  Search,
  ExternalLink,
  Filter,
  Calendar,
  CalendarIcon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowUpDown,
  LayoutGrid,
  Tag,
} from "lucide-react";
import { isThisWeek, isBefore, startOfDay } from "date-fns";

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const priorityWeight: Record<string, number> = { high: 0, medium: 1, low: 2 };

export default function ActionItemsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "completed">("open");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"created" | "dueDate" | "priority" | "meeting">("created");
  const [groupBy, setGroupBy] = useState<"meeting" | "assignee" | "tag">("meeting");

  const utils = api.useUtils();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/action-items");
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
    data: actionItemsData, 
    isLoading,
    error,
  } = api.actionItems.getAllActionItems.useQuery(
    { includeCompleted: true },
    { enabled: !!session && isGC }
  );

  // Get meetings data to show meeting titles
  const { data: meetingsData } = api.bots.getUserMeetings.useQuery(
    { limit: 100, offset: 0 },
    { enabled: !!session && isGC }
  );

  const { data: tagsData } = api.actionItems.getTags.useQuery(
    undefined,
    { enabled: !!session && isGC }
  );
  const allTags = tagsData?.tags ?? [];

  const allItemIds = (actionItemsData?.actionItems ?? []).map((i) => i.id);
  const { data: tagAssignmentsData } = api.actionItems.getTagsForItems.useQuery(
    { actionItemIds: allItemIds },
    { enabled: allItemIds.length > 0 }
  );
  const tagAssignments = tagAssignmentsData?.assignments ?? {};

  const updateMutation = api.actionItems.updateActionItem.useMutation({
    onSuccess: () => {
      void utils.actionItems.getAllActionItems.invalidate();
    },
  });

  const handleToggleComplete = (id: number, isCompleted: boolean) => {
    updateMutation.mutate({ id, isCompleted: !isCompleted });
  };

  const handlePriorityChange = (id: number, priority: "low" | "medium" | "high") => {
    updateMutation.mutate({ id, priority });
  };

  // Create a map of bot IDs to meeting titles
  const meetingTitles: Record<number, string> = {};
  const meetingDates: Record<number, Date | null> = {};
  meetingsData?.meetings?.forEach((meeting) => {
    meetingTitles[meeting.id] = meeting.meetingTitle;
    meetingDates[meeting.id] = meeting.scheduledDate ?? meeting.createdAt;
  });

  // Filter action items
  let actionItems = actionItemsData?.actionItems ?? [];
  
  if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    actionItems = actionItems.filter(
      (item) =>
        item.content.toLowerCase().includes(searchLower) ||
        item.assignee?.toLowerCase().includes(searchLower)
    );
  }

  if (statusFilter === "open") {
    actionItems = actionItems.filter((item) => !item.isCompleted);
  } else if (statusFilter === "completed") {
    actionItems = actionItems.filter((item) => item.isCompleted);
  }

  if (priorityFilter !== "all") {
    actionItems = actionItems.filter((item) => item.priority === priorityFilter);
  }

  if (categoryFilter !== "all") {
    actionItems = actionItems.filter((item) => item.category === categoryFilter);
  }

  if (tagFilter !== "all") {
    actionItems = actionItems.filter((item) => {
      const itemTags = tagAssignments[String(item.id)] ?? [];
      return itemTags.some((t: { id: number }) => String(t.id) === tagFilter);
    });
  }

  // Sort
  actionItems = [...actionItems].sort((a, b) => {
    switch (sortBy) {
      case "dueDate": {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      }
      case "priority":
        return (priorityWeight[a.priority ?? "medium"] ?? 1) - (priorityWeight[b.priority ?? "medium"] ?? 1);
      case "meeting":
        return a.botId - b.botId;
      default:
        return 0;
    }
  });

  // Group items
  const groupedItems: Record<string, typeof actionItems> = {};
  actionItems.forEach((item) => {
    let key: string;
    switch (groupBy) {
      case "assignee":
        key = item.assignee ?? "Unassigned";
        break;
      case "tag": {
        const itemTags = tagAssignments[String(item.id)] ?? [];
        key = itemTags.length > 0 ? (itemTags[0] as { name: string }).name : "No Tags";
        break;
      }
      default:
        key = String(item.botId);
    }
    groupedItems[key] ??= [];
    groupedItems[key]!.push(item);
  });

  // Stats
  const allItems = actionItemsData?.actionItems ?? [];
  const openCount = allItems.filter((i) => !i.isCompleted).length;
  const completedCount = allItems.filter((i) => i.isCompleted).length;
  const today = startOfDay(new Date());
  const overdueCount = allItems.filter(
    (i) => !i.isCompleted && i.dueDate && isBefore(new Date(i.dueDate), today)
  ).length;
  const dueThisWeekCount = allItems.filter(
    (i) => !i.isCompleted && i.dueDate && isThisWeek(new Date(i.dueDate), { weekStartsOn: 1 })
  ).length;

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ListTodo className="h-8 w-8" />
          Action Items Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Track and manage action items across all meetings
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("open")}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open</p>
                <p className="text-2xl font-bold">{openCount}</p>
              </div>
              <ListTodo className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setStatusFilter("open"); setSortBy("dueDate"); }}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-red-600">{overdueCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setStatusFilter("open"); setSortBy("dueDate"); }}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Due This Week</p>
                <p className="text-2xl font-bold text-amber-600">{dueThisWeekCount}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("completed")}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-green-600">{completedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search action items..."
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
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={(v: string) => setPriorityFilter(v as typeof priorityFilter)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
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
              {allTags.length > 0 && (
                <Select value={tagFilter} onValueChange={setTagFilter}>
                  <SelectTrigger className="w-[140px]">
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" />
                      <SelectValue placeholder="Tag" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tags</SelectItem>
                    {allTags.map((tag) => (
                      <SelectItem key={tag.id} value={String(tag.id)}>
                        <div className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                          {tag.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v: string) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created">Date Created</SelectItem>
                  <SelectItem value="dueDate">Due Date</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                </SelectContent>
              </Select>
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              <Select value={groupBy} onValueChange={(v: string) => setGroupBy(v as typeof groupBy)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meeting">By Meeting</SelectItem>
                  <SelectItem value="assignee">By Assignee</SelectItem>
                  <SelectItem value="tag">By Tag</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4 text-red-600">
              Failed to load action items: {error.message}
            </div>
          ) : actionItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No action items found</p>
              <p className="text-sm mt-1">Action items from your meetings will appear here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedItems).map(([groupKey, items]) => {
                const isMeetingGroup = groupBy === "meeting";
                const meetingDate = isMeetingGroup ? meetingDates[Number(groupKey)] : null;
                const hasMeetingDate = meetingDate instanceof Date;

                const groupLabel = isMeetingGroup
                  ? (meetingTitles[Number(groupKey)] ?? `Meeting #${groupKey}`)
                  : groupKey;

                return (
                  <div key={groupKey} className="border rounded-lg overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{groupLabel}</h3>
                        <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                        {hasMeetingDate && (
                          <span className="text-muted-foreground text-sm flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(meetingDate, "MMM d, yyyy")}
                          </span>
                        )}
                      </div>
                      {isMeetingGroup && (
                        <Link href={`/meetings/${groupKey}`}>
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View Meeting
                          </Button>
                        </Link>
                      )}
                    </div>
                    <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Done</TableHead>
                        <TableHead>Action Item</TableHead>
                        <TableHead className="w-[150px]">Assignee</TableHead>
                        <TableHead className="w-[100px]">Priority</TableHead>
                        <TableHead className="w-[130px]">Category</TableHead>
                        <TableHead className="w-[120px]">Due Date</TableHead>
                        <TableHead className="w-[120px]">Tags</TableHead>
                        <TableHead className="w-[100px]">Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id} className={item.isCompleted ? "opacity-60" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={item.isCompleted ?? false}
                              onCheckedChange={() => handleToggleComplete(item.id, item.isCompleted ?? false)}
                              disabled={updateMutation.isPending}
                            />
                          </TableCell>
                          <TableCell>
                            <span className={item.isCompleted ? "line-through" : ""}>
                              {item.content}
                            </span>
                          </TableCell>
                          <TableCell>{item.assignee ?? "-"}</TableCell>
                          <TableCell>
                            <Select
                              value={item.priority ?? "medium"}
                              onValueChange={(v: string) => handlePriorityChange(item.id, v as "low" | "medium" | "high")}
                              disabled={updateMutation.isPending}
                            >
                              <SelectTrigger className="h-8 w-full">
                                <Badge 
                                  variant="outline"
                                  className={priorityColors[item.priority ?? "medium"]}
                                >
                                  {item.priority ?? "medium"}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="high">
                                  <Badge variant="outline" className={priorityColors.high}>High</Badge>
                                </SelectItem>
                                <SelectItem value="medium">
                                  <Badge variant="outline" className={priorityColors.medium}>Medium</Badge>
                                </SelectItem>
                                <SelectItem value="low">
                                  <Badge variant="outline" className={priorityColors.low}>Low</Badge>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {item.category ? (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                {item.category}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 hover:bg-muted ${
                                    item.dueDate && !item.isCompleted && new Date(item.dueDate) < new Date()
                                      ? "text-red-600 font-medium"
                                      : "text-muted-foreground"
                                  }`}
                                  disabled={updateMutation.isPending}
                                >
                                  <CalendarIcon className="h-3 w-3" />
                                  {item.dueDate ? format(new Date(item.dueDate), "MMM d, yyyy") : "Set date"}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarPicker
                                  mode="single"
                                  selected={item.dueDate ? new Date(item.dueDate) : undefined}
                                  onSelect={(date: Date | undefined) => {
                                    updateMutation.mutate({ id: item.id, dueDate: date ?? null });
                                  }}
                                  initialFocus
                                />
                                {item.dueDate && (
                                  <div className="border-t p-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="w-full text-muted-foreground"
                                      onClick={() => updateMutation.mutate({ id: item.id, dueDate: null })}
                                    >
                                      Clear due date
                                    </Button>
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(tagAssignments[String(item.id)] ?? []).map((tag: { id: number; name: string; color: string }) => (
                                <Badge
                                  key={tag.id}
                                  variant="outline"
                                  className="text-xs py-0"
                                  style={{ borderColor: tag.color, color: tag.color }}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {item.createdAt 
                              ? format(new Date(item.createdAt), "MMM d")
                              : "-"
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    </Table>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
