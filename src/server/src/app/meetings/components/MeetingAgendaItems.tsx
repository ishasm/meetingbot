"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { api } from "~/trpc/react";
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  Sparkles, 
  RefreshCw,
  Check,
  X,
  Clock,
  User,
  MessageSquare,
  Gavel,
  ChevronsUpDown,
  Loader2,
  Eye,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { AgendaItemDetailModal } from "./AgendaItemDetailModal";

interface MeetingAgendaItemsProps {
  botId: number;
  hasTranscription: boolean;
}

const statusColors: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800 border-blue-200",
  Closed: "bg-green-100 text-green-800 border-green-200",
};

const DURATION_OPTIONS = [
  { value: "5 Minutes", label: "5 min" },
  { value: "10 Minutes", label: "10 min" },
  { value: "15 Minutes", label: "15 min" },
  { value: "20 Minutes", label: "20 min" },
  { value: "30 Minutes", label: "30 min" },
  { value: "45 Minutes", label: "45 min" },
  { value: "1 Hour", label: "1 hour" },
  { value: "1.5 Hours", label: "1.5 hours" },
  { value: "2 Hours", label: "2 hours" },
];

interface AgendaFormData {
  description: string;
  duration: string;
  ownerAttendeeIds: number[];
}

const emptyFormData: AgendaFormData = {
  description: "",
  duration: "",
  ownerAttendeeIds: [],
};

export function MeetingAgendaItems({ botId, hasTranscription }: MeetingAgendaItemsProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [formData, setFormData] = useState<AgendaFormData>(emptyFormData);
  const [ownerSelectOpen, setOwnerSelectOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<typeof agendaItems[0] | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const utils = api.useUtils();

  // Get agenda items for this meeting
  const { data: agendaItemsData, isLoading } = 
    api.agendaItems.getByMeeting.useQuery({ botId });

  // Get all attendees for owner dropdown
  const { data: attendeesData } = api.attendees.getAll.useQuery({});

  const createMutation = api.agendaItems.create.useMutation({
    onSuccess: () => {
      void utils.agendaItems.getByMeeting.invalidate({ botId });
      setShowAddDialog(false);
      setFormData(emptyFormData);
    },
  });

  const deleteMutation = api.agendaItems.delete.useMutation({
    onSuccess: () => {
      void utils.agendaItems.getByMeeting.invalidate({ botId });
    },
  });

  const generateSummariesMutation = api.agendaItems.generateSummaries.useMutation({
    onSuccess: () => {
      void utils.agendaItems.getByMeeting.invalidate({ botId });
    },
  });

  const handleCreate = () => {
    if (!formData.description.trim()) return;
    createMutation.mutate({
      botId,
      description: formData.description.trim(),
      duration: formData.duration || undefined,
      ownerAttendeeIds: formData.ownerAttendeeIds.length > 0 ? formData.ownerAttendeeIds : undefined,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this agenda item?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleGenerateSummaries = () => {
    generateSummariesMutation.mutate({ botId });
  };

  const handleOpenDetail = (item: typeof agendaItems[0]) => {
    setSelectedItem(item);
    setDetailModalOpen(true);
  };

  const toggleOwner = (attendeeId: number) => {
    setFormData((prev) => {
      const ids = prev.ownerAttendeeIds;
      if (ids.includes(attendeeId)) {
        return { ...prev, ownerAttendeeIds: ids.filter((id) => id !== attendeeId) };
      } else {
        return { ...prev, ownerAttendeeIds: [...ids, attendeeId] };
      }
    });
  };

  const agendaItems = agendaItemsData?.agendaItems ?? [];
  const attendees = attendeesData?.attendees ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Agenda Items
          {agendaItems.length > 0 && (
            <Badge variant="secondary">{agendaItems.length}</Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Add Agenda Item</DialogTitle>
                <DialogDescription>
                  Add a new agenda item for this meeting
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Enter the agenda item description..."
                    rows={4}
                    className="resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duration</Label>
                    <Select
                      value={formData.duration}
                      onValueChange={(v) => setFormData({ ...formData, duration: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Owners</Label>
                    <Popover open={ownerSelectOpen} onOpenChange={setOwnerSelectOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                        >
                          {formData.ownerAttendeeIds.length > 0 
                            ? `${formData.ownerAttendeeIds.length} selected`
                            : "Select owners..."
                          }
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search attendees..." />
                          <CommandList className="max-h-[200px]">
                            <CommandEmpty>No attendees found.</CommandEmpty>
                            <CommandGroup>
                              {attendees.map((attendee) => {
                                const isSelected = formData.ownerAttendeeIds.includes(attendee.id);
                                return (
                                  <CommandItem
                                    key={attendee.id}
                                    value={attendee.name}
                                    onSelect={() => toggleOwner(attendee.id)}
                                  >
                                    <div className={cn(
                                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                      isSelected
                                        ? "bg-primary text-primary-foreground"
                                        : "opacity-50 [&_svg]:invisible"
                                    )}>
                                      <Check className="h-3 w-3" />
                                    </div>
                                    <span className="truncate">{attendee.name}</span>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {formData.ownerAttendeeIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formData.ownerAttendeeIds.map((id) => {
                      const attendee = attendees.find((a) => a.id === id);
                      return attendee ? (
                        <Badge key={id} variant="secondary" className="gap-1">
                          {attendee.name}
                          <button 
                            type="button"
                            onClick={() => toggleOwner(id)}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !formData.description.trim()}
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {hasTranscription && agendaItems.length > 0 && (
            <Button
              size="sm"
              onClick={handleGenerateSummaries}
              disabled={generateSummariesMutation.isPending}
            >
              {generateSummariesMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Summaries
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : generateSummariesMutation.isPending ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Analyzing transcript and generating summaries...
            </p>
          </div>
        ) : agendaItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium">No agenda items yet</p>
            <p className="text-sm mt-1">Add agenda items to track discussion topics</p>
          </div>
        ) : (
          <div className="space-y-2">
            {agendaItems.map((item) => {
              const hasDetails = item.discussionSummary ?? item.decisionResolution;
              
              return (
                <div
                  key={item.id}
                  className={cn(
                    "border rounded-lg transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group",
                    item.status === "Closed" ? "bg-muted/30" : "bg-card"
                  )}
                  onClick={() => handleOpenDetail(item)}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      {/* Serial number */}
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                        {item.serialNum}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className={cn(
                            "font-medium leading-relaxed line-clamp-2",
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

                          {item.ownerNames && item.ownerNames.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5" />
                              <span className="truncate max-w-[200px]">
                                {item.ownerNames.map((o) => o.name).join(", ")}
                              </span>
                            </div>
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

                      {/* Actions */}
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
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(item.id);
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        <AgendaItemDetailModal
          item={selectedItem}
          open={detailModalOpen}
          onOpenChange={setDetailModalOpen}
        />

        {createMutation.error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            Failed to create agenda item: {createMutation.error.message}
          </div>
        )}

        {generateSummariesMutation.error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            Failed to generate summaries: {generateSummariesMutation.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
