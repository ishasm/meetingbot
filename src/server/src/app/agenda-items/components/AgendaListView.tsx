"use client";

import Link from "next/link";
import { format } from "date-fns";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { 
  ExternalLink,
  Clock,
  User,
  MessageSquare,
  Gavel,
  Eye,
  Calendar,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { type AgendaViewProps, type AgendaItem, statusColors } from "./types";

export function AgendaListView({ items, onItemClick }: AgendaViewProps) {
  // Group by meeting
  const groupedItems: Record<number, AgendaItem[]> = {};
  items.forEach((item) => {
    const group = groupedItems[item.botId];
    if (!group) {
      groupedItems[item.botId] = [item];
    } else {
      group.push(item);
    }
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {Object.entries(groupedItems).map(([botId, groupItems]) => (
        <div key={botId} className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-lg">
                {groupItems[0]?.meetingTitle ?? `Meeting #${botId}`}
              </h3>
              {groupItems[0]?.meetingDate != null && (
                <span className="text-muted-foreground text-sm flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(groupItems[0].meetingDate), "MMM d, yyyy")}
                </span>
              )}
            </div>
            <Link href={`/meetings/${botId}`}>
              <Button variant="ghost" size="sm">
                <ExternalLink className="h-4 w-4 mr-1" />
                View Meeting
              </Button>
            </Link>
          </div>
          <div className="divide-y">
            {groupItems.map((item) => {
              const hasDetails = item.discussionSummary ?? item.decisionResolution;
              
              return (
                <div
                  key={item.id}
                  className={cn(
                    "p-4 hover:bg-muted/30 cursor-pointer transition-colors group",
                    item.status === "Closed" && "bg-muted/20"
                  )}
                  onClick={() => onItemClick(item)}
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
                                onItemClick(item);
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
  );
}
