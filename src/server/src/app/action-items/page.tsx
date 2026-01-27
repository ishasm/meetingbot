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
import { 
  ListTodo, 
  Search,
  ExternalLink,
  Filter,
} from "lucide-react";

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

export default function ActionItemsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "completed">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");

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
  meetingsData?.meetings?.forEach((meeting) => {
    meetingTitles[meeting.id] = meeting.meetingTitle;
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

  // Group by meeting
  const groupedItems: Record<number, typeof actionItems> = {};
  actionItems.forEach((item) => {
    const group = groupedItems[item.botId];
    if (!group) {
      groupedItems[item.botId] = [item];
    } else {
      group.push(item);
    }
  });

  const openCount = actionItemsData?.actionItems?.filter((i) => !i.isCompleted).length ?? 0;
  const completedCount = actionItemsData?.actionItems?.filter((i) => i.isCompleted).length ?? 0;

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
            <ListTodo className="h-8 w-8" />
            All Action Items
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage action items across all meetings
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm">
            {openCount} Open
          </Badge>
          <Badge variant="secondary" className="text-sm">
            {completedCount} Completed
          </Badge>
        </div>
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
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as typeof priorityFilter)}>
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
              {Object.entries(groupedItems).map(([botId, items]) => (
                <div key={botId} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                    <h3 className="font-medium">
                      {meetingTitles[Number(botId)] ?? `Meeting #${botId}`}
                    </h3>
                    <Link href={`/meetings/${botId}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View Meeting
                      </Button>
                    </Link>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">Done</TableHead>
                        <TableHead>Action Item</TableHead>
                        <TableHead className="w-[150px]">Assignee</TableHead>
                        <TableHead className="w-[100px]">Priority</TableHead>
                        <TableHead className="w-[120px]">Due Date</TableHead>
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
                              onValueChange={(v) => handlePriorityChange(item.id, v as "low" | "medium" | "high")}
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
                            {item.dueDate 
                              ? format(new Date(item.dueDate), "MMM d, yyyy")
                              : "-"
                            }
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
