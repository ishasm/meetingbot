"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import { Users, X, Check, ChevronsUpDown, UserPlus, Loader2, Building2, Monitor, XCircle } from "lucide-react";
import { cn } from "~/lib/utils";

const attendanceModeConfig: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
  "in-person": { label: "In-Person", icon: <Building2 className="h-3.5 w-3.5" />, className: "text-green-700 bg-green-50 border-green-200" },
  "virtual": { label: "Virtual", icon: <Monitor className="h-3.5 w-3.5" />, className: "text-blue-700 bg-blue-50 border-blue-200" },
  "absent": { label: "Absent", icon: <XCircle className="h-3.5 w-3.5" />, className: "text-red-700 bg-red-50 border-red-200" },
};

interface MeetingAttendeesProps {
  botId: number;
  meetingStatus?: string;
}

export function MeetingAttendees({ botId, meetingStatus }: MeetingAttendeesProps) {
  const [open, setOpen] = useState(false);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<number>>(new Set());

  const utils = api.useUtils();

  // Get attendees for this meeting
  const { data: meetingAttendeesData, isLoading: isLoadingMeetingAttendees } = 
    api.meetingAttendees.getByMeeting.useQuery({ botId });

  // Get all attendees for the dropdown
  const { data: allAttendeesData, isLoading: isLoadingAllAttendees } = 
    api.attendees.getAll.useQuery({});

  const bulkAddMutation = api.meetingAttendees.bulkAdd.useMutation({
    onSuccess: () => {
      void utils.meetingAttendees.getByMeeting.invalidate({ botId });
      setSelectedAttendeeIds(new Set());
      setOpen(false);
    },
  });

  const removeMutation = api.meetingAttendees.remove.useMutation({
    onSuccess: () => {
      void utils.meetingAttendees.getByMeeting.invalidate({ botId });
    },
  });

  const updateAttendanceModeMutation = api.meetingAttendees.updateAttendanceMode.useMutation({
    onSuccess: () => {
      void utils.meetingAttendees.getByMeeting.invalidate({ botId });
    },
  });

  const handleAttendanceModeChange = (attendeeId: number, mode: string) => {
    updateAttendanceModeMutation.mutate({
      botId,
      attendeeId,
      attendanceMode: mode === "none" ? null : mode as "in-person" | "virtual" | "absent",
    });
  };

  const handleToggleAttendee = (attendeeId: number) => {
    setSelectedAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(attendeeId)) {
        next.delete(attendeeId);
      } else {
        next.add(attendeeId);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    if (selectedAttendeeIds.size > 0) {
      bulkAddMutation.mutate({ 
        botId, 
        attendeeIds: Array.from(selectedAttendeeIds) 
      });
    }
  };

  const handleRemoveAttendee = (attendeeId: number) => {
    removeMutation.mutate({ botId, attendeeId });
  };

  const meetingAttendees = meetingAttendeesData?.attendees ?? [];
  const allAttendees = allAttendeesData?.attendees ?? [];
  
  // Filter out already added attendees
  const availableAttendees = allAttendees.filter(
    (a) => !meetingAttendees.some((ma) => ma.id === a.id)
  );

  const selectedCount = selectedAttendeeIds.size;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Meeting Attendees
          {meetingAttendees.length > 0 && (
            <Badge variant="secondary" className="ml-1">{meetingAttendees.length}</Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="min-w-[200px] justify-between"
                disabled={isLoadingAllAttendees || availableAttendees.length === 0}
              >
                {availableAttendees.length === 0 
                  ? "All attendees added"
                  : selectedCount > 0 
                    ? `${selectedCount} selected` 
                    : "Select attendees..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="end">
              <Command>
                <CommandInput placeholder="Search attendees..." />
                <CommandList className="max-h-[300px]">
                  <CommandEmpty>No attendee found.</CommandEmpty>
                  <CommandGroup>
                    {availableAttendees.map((attendee) => {
                      const isSelected = selectedAttendeeIds.has(attendee.id);
                      return (
                        <CommandItem
                          key={attendee.id}
                          value={attendee.name}
                          onSelect={() => handleToggleAttendee(attendee.id)}
                          className="cursor-pointer"
                        >
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}>
                            <Check className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{attendee.name}</div>
                            {(attendee.role ?? attendee.department) && (
                              <div className="text-xs text-muted-foreground truncate">
                                {[attendee.role, attendee.department].filter(Boolean).join(" • ")}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                {selectedCount > 0 && (
                  <div className="border-t p-2">
                    <Button 
                      size="sm" 
                      className="w-full"
                      onClick={handleAddSelected}
                      disabled={bulkAddMutation.isPending}
                    >
                      {bulkAddMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add {selectedCount} attendee{selectedCount > 1 ? "s" : ""}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingMeetingAttendees ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : meetingAttendees.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="font-medium">No attendees added yet</p>
            <p className="text-sm mt-1">Select attendees from the dropdown above to add them</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {meetingAttendees.map((attendee) => {
              const isMeetingDone = meetingStatus === "DONE" || meetingStatus === "CALL_ENDED";
              const mode = attendee.attendanceMode;
              const modeConfig = mode ? attendanceModeConfig[mode] : null;

              return (
                <div
                  key={attendee.id}
                  className="flex items-center gap-3 bg-muted/50 hover:bg-muted rounded-lg px-4 py-3 transition-colors group"
                >
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm shrink-0">
                    {attendee.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{attendee.name}</div>
                    {(attendee.role ?? attendee.department) && (
                      <div className="text-xs text-muted-foreground truncate">
                        {[attendee.role, attendee.department].filter(Boolean).join(" • ")}
                      </div>
                    )}
                    {isMeetingDone && (
                      <div className="mt-1.5">
                        <Select
                          value={mode ?? "none"}
                          onValueChange={(v: string) => handleAttendanceModeChange(attendee.id, v)}
                          disabled={updateAttendanceModeMutation.isPending}
                        >
                          <SelectTrigger className="h-7 w-[130px] text-xs">
                            {modeConfig ? (
                              <Badge variant="outline" className={cn("text-xs gap-1", modeConfig.className)}>
                                {modeConfig.icon}
                                {modeConfig.label}
                              </Badge>
                            ) : (
                              <SelectValue placeholder="Mark attendance" />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground">Not marked</span>
                            </SelectItem>
                            <SelectItem value="in-person">
                              <span className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-green-600" />
                                In-Person
                              </span>
                            </SelectItem>
                            <SelectItem value="virtual">
                              <span className="flex items-center gap-1.5">
                                <Monitor className="h-3.5 w-3.5 text-blue-600" />
                                Virtual
                              </span>
                            </SelectItem>
                            <SelectItem value="absent">
                              <span className="flex items-center gap-1.5">
                                <XCircle className="h-3.5 w-3.5 text-red-600" />
                                Absent
                              </span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {!isMeetingDone && modeConfig && (
                      <Badge variant="outline" className={cn("text-xs gap-1 mt-1", modeConfig.className)}>
                        {modeConfig.icon}
                        {modeConfig.label}
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveAttendee(attendee.id)}
                    disabled={removeMutation.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {bulkAddMutation.error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            Failed to add attendees: {bulkAddMutation.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
