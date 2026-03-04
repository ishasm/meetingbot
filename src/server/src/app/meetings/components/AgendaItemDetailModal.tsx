"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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
import { api } from "~/trpc/react";
import { 
  Clock, 
  User, 
  Calendar,
  MessageSquare,
  Gavel,
  FileText,
  Sparkles,
  Check,
  ChevronsUpDown,
  X,
  Loader2,
  ExternalLink,
  Tag,
} from "lucide-react";
import { cn } from "~/lib/utils";
import Link from "next/link";

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

interface AgendaItem {
  id: number;
  botId: number;
  serialNum: number;
  description: string;
  duration: string | null;
  dateAdded: Date | null;
  status: string | null;
  remarks: string | null;
  discussionSummary: string | null;
  decisionResolution: string | null;
  ownerAttendeeId: number | null;
  ownerAttendeeIds?: number[] | null;
  sadhguruComments: string | null;
  attachments: string[] | null;
  category?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  ownerName?: string | null;
  ownerNames?: { id: number; name: string }[];
  meetingTitle?: string;
}

interface AgendaItemDetailModalProps {
  item: AgendaItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
  showMeetingLink?: boolean;
}

export function AgendaItemDetailModal({ 
  item, 
  open, 
  onOpenChange,
  onUpdate,
  showMeetingLink = false,
}: AgendaItemDetailModalProps) {
  const [editedItem, setEditedItem] = useState<Partial<AgendaItem>>({});
  const [ownerSelectOpen, setOwnerSelectOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const utils = api.useUtils();

  // Get all attendees for owner dropdown
  const { data: attendeesData } = api.attendees.getAll.useQuery({});
  const attendees = attendeesData?.attendees ?? [];

  const updateMutation = api.agendaItems.update.useMutation({
    onSuccess: () => {
      void utils.agendaItems.getAll.invalidate();
      void utils.agendaItems.getByMeeting.invalidate();
      setHasChanges(false);
      onUpdate?.();
    },
  });

  // Reset edited item when modal opens or item changes
  useEffect(() => {
    if (item && open) {
      setEditedItem({
        description: item.description,
        duration: item.duration,
        status: item.status,
        remarks: item.remarks,
        discussionSummary: item.discussionSummary,
        decisionResolution: item.decisionResolution,
        sadhguruComments: item.sadhguruComments,
        category: item.category,
        ownerAttendeeIds: item.ownerAttendeeIds ?? (item.ownerAttendeeId ? [item.ownerAttendeeId] : []),
      });
      setHasChanges(false);
    }
  }, [item, open]);

  const handleFieldChange = <K extends keyof AgendaItem>(field: K, value: AgendaItem[K]) => {
    setEditedItem((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!item) return;
    
    const updates: Record<string, unknown> = { id: item.id };
    
    if (editedItem.description !== item.description) {
      updates.description = editedItem.description;
    }
    if (editedItem.duration !== item.duration) {
      updates.duration = editedItem.duration ?? null;
    }
    if (editedItem.status !== item.status) {
      updates.status = editedItem.status;
    }
    if (editedItem.remarks !== item.remarks) {
      updates.remarks = editedItem.remarks ?? null;
    }
    if (editedItem.discussionSummary !== item.discussionSummary) {
      updates.discussionSummary = editedItem.discussionSummary ?? null;
    }
    if (editedItem.decisionResolution !== item.decisionResolution) {
      updates.decisionResolution = editedItem.decisionResolution ?? null;
    }
    if (editedItem.sadhguruComments !== item.sadhguruComments) {
      updates.sadhguruComments = editedItem.sadhguruComments ?? null;
    }
    if (editedItem.category !== item.category) {
      updates.category = editedItem.category ?? null;
    }
    
    const currentOwnerIds = item.ownerAttendeeIds ?? (item.ownerAttendeeId ? [item.ownerAttendeeId] : []);
    const newOwnerIds = editedItem.ownerAttendeeIds ?? [];
    if (JSON.stringify(currentOwnerIds.sort()) !== JSON.stringify([...newOwnerIds].sort())) {
      updates.ownerAttendeeIds = newOwnerIds;
    }
    
    if (Object.keys(updates).length > 1) {
      updateMutation.mutate(updates as Parameters<typeof updateMutation.mutate>[0]);
    }
  };

  const toggleOwner = (attendeeId: number) => {
    const currentIds = editedItem.ownerAttendeeIds ?? [];
    if (currentIds.includes(attendeeId)) {
      handleFieldChange("ownerAttendeeIds", currentIds.filter((id) => id !== attendeeId));
    } else {
      handleFieldChange("ownerAttendeeIds", [...currentIds, attendeeId]);
    }
  };

  if (!item) return null;

  const ownerIds = editedItem.ownerAttendeeIds ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
                {item.serialNum}
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-xl leading-tight">
                  Agenda Item #{item.serialNum}
                </DialogTitle>
                {showMeetingLink && item.meetingTitle && (
                  <Link 
                    href={`/meetings/${item.botId}`}
                    className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {item.meetingTitle}
                  </Link>
                )}
              </div>
            </div>
            <Select
              value={editedItem.status ?? "Open"}
              onValueChange={(v) => handleFieldChange("status", v)}
            >
              <SelectTrigger className="w-auto border-0">
                <Badge
                  variant="outline"
                  className={cn("text-sm", statusColors[editedItem.status ?? "Open"])}
                >
                  {editedItem.status ?? "Open"}
                </Badge>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Open">
                  <Badge variant="outline" className={statusColors.Open}>Open</Badge>
                </SelectItem>
                <SelectItem value="Closed">
                  <Badge variant="outline" className={statusColors.Closed}>Closed</Badge>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Description
            </Label>
            <Textarea
              value={editedItem.description ?? ""}
              onChange={(e) => handleFieldChange("description", e.target.value)}
              rows={3}
              className="resize-none"
              placeholder="Enter description..."
            />
          </div>

          {/* Meta row: Duration, Owners, Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Duration
              </Label>
              <Select
                value={editedItem.duration ?? "none"}
                onValueChange={(v) => handleFieldChange("duration", v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select duration" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No duration</SelectItem>
                  {DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Owners
              </Label>
              <Popover open={ownerSelectOpen} onOpenChange={setOwnerSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {ownerIds.length > 0 
                      ? `${ownerIds.length} selected`
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
                          const isSelected = ownerIds.includes(attendee.id);
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

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Date Added
              </Label>
              <Input
                value={item.dateAdded ? format(new Date(item.dateAdded), "PPP") : "-"}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              Category
            </Label>
            <Select
              value={editedItem.category ?? "none"}
              onValueChange={(v) => handleFieldChange("category", v === "none" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                <SelectItem value="Policy">Policy</SelectItem>
                <SelectItem value="Budget Approval">Budget Approval</SelectItem>
                <SelectItem value="Follow-up">Follow-up</SelectItem>
                <SelectItem value="General">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selected owners display */}
          {ownerIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {ownerIds.map((id) => {
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

          <Separator />

          {/* Remarks */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Remarks
            </Label>
            <Textarea
              value={editedItem.remarks ?? ""}
              onChange={(e) => handleFieldChange("remarks", e.target.value)}
              rows={2}
              className="resize-none"
              placeholder="Add remarks..."
            />
          </div>

          {/* Discussion Summary */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-600" />
              Discussion Summary
            </Label>
            <div className="rounded-lg border bg-blue-50/50 p-1">
              <Textarea
                value={editedItem.discussionSummary ?? ""}
                onChange={(e) => handleFieldChange("discussionSummary", e.target.value)}
                rows={3}
                className="resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Summary of what was discussed..."
              />
            </div>
          </div>

          {/* Decision / Resolution */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Gavel className="h-4 w-4 text-green-600" />
              Decision / Resolution
            </Label>
            <div className="rounded-lg border border-green-200 bg-green-50/50 p-1">
              <Textarea
                value={editedItem.decisionResolution ?? ""}
                onChange={(e) => handleFieldChange("decisionResolution", e.target.value)}
                rows={2}
                className="resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Final decision or resolution..."
              />
            </div>
          </div>

          {/* Guidance */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-600" />
              Guidance
            </Label>
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-1">
              <Textarea
                value={editedItem.sadhguruComments ?? ""}
                onChange={(e) => handleFieldChange("sadhguruComments", e.target.value)}
                rows={2}
                className="resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                placeholder="Enter guidance..."
              />
            </div>
          </div>

          {/* Timestamps */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
            <span>
              Created: {item.createdAt ? format(new Date(item.createdAt), "PPp") : "-"}
            </span>
            <span>
              Updated: {item.updatedAt ? format(new Date(item.updatedAt), "PPp") : "-"}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>

        {updateMutation.error && (
          <div className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-600">
            Failed to save: {updateMutation.error.message}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
