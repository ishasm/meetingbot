"use client";

import { format } from "date-fns";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { 
  Clock,
  User,
  MessageSquare,
  Gavel,
  Calendar,
  GripVertical,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { type AgendaViewProps } from "./types";

const COLUMNS = [
  { id: "Open", title: "Open", color: "bg-blue-500" },
  { id: "Closed", title: "Closed", color: "bg-green-500" },
];

export function AgendaKanbanView({ items, onItemClick, onStatusChange }: AgendaViewProps) {
  // Group items by status
  const getItemsByStatus = (status: string) => {
    return items.filter((item) => (item.status ?? "Open") === status);
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Dropped outside a droppable area
    if (!destination) return;

    // Dropped in the same position
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Find the item and update its status
    const itemId = parseInt(draggableId.replace("item-", ""), 10);
    const newStatus = destination.droppableId;

    if (onStatusChange) {
      onStatusChange(itemId, newStatus);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-6 overflow-x-auto pb-4">
        {COLUMNS.map((column) => {
          const columnItems = getItemsByStatus(column.id);
          
          return (
            <div
              key={column.id}
              className="flex-shrink-0 w-[350px] flex flex-col"
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={cn("w-3 h-3 rounded-full", column.color)} />
                <h3 className="font-semibold">{column.title}</h3>
                <Badge variant="secondary" className="ml-auto">
                  {columnItems.length}
                </Badge>
              </div>

              {/* Column content */}
              <Droppable droppableId={column.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 rounded-lg border-2 border-dashed p-2 min-h-[200px] transition-colors",
                      snapshot.isDraggingOver
                        ? "border-primary bg-primary/5"
                        : "border-muted bg-muted/30"
                    )}
                  >
                    <div className="space-y-2">
                      {columnItems.map((item, index) => (
                        <Draggable
                          key={item.id}
                          draggableId={`item-${item.id}`}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={cn(
                                "bg-background rounded-lg border p-3 shadow-sm cursor-pointer transition-shadow",
                                snapshot.isDragging && "shadow-lg ring-2 ring-primary",
                                item.status === "Closed" && "opacity-75"
                              )}
                              onClick={() => onItemClick(item)}
                            >
                              {/* Card header */}
                              <div className="flex items-start gap-2 mb-2">
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-0.5 cursor-grab active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                                  {item.serialNum}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    "text-sm font-medium line-clamp-2",
                                    item.status === "Closed" && "line-through text-muted-foreground"
                                  )}>
                                    {item.description}
                                  </p>
                                </div>
                              </div>

                              {/* Meeting info */}
                              <div className="text-xs text-muted-foreground mb-2 pl-6">
                                <div className="flex items-center gap-1 truncate">
                                  <Calendar className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{item.meetingTitle ?? "-"}</span>
                                </div>
                                {item.meetingDate != null && (
                                  <div className="text-xs mt-0.5">
                                    {format(new Date(item.meetingDate), "MMM d, yyyy")}
                                  </div>
                                )}
                              </div>

                              {/* Meta info */}
                              <div className="flex flex-wrap items-center gap-2 pl-6">
                                {item.duration && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>{item.duration}</span>
                                  </div>
                                )}

                                {item.ownerNames && item.ownerNames.length > 0 && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <User className="h-3 w-3" />
                                    <span className="truncate max-w-[100px]">
                                      {item.ownerNames[0]?.name}
                                      {item.ownerNames.length > 1 && ` +${item.ownerNames.length - 1}`}
                                    </span>
                                  </div>
                                )}

                                {/* Indicators */}
                                <div className="flex items-center gap-1 ml-auto">
                                  {item.discussionSummary && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                                        </TooltipTrigger>
                                        <TooltipContent>Has discussion summary</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {item.decisionResolution && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <Gavel className="h-3.5 w-3.5 text-green-600" />
                                        </TooltipTrigger>
                                        <TooltipContent>Has decision/resolution</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>

                    {/* Empty state */}
                    {columnItems.length === 0 && (
                      <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                        No items
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
