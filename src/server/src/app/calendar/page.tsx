"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, addDays } from "date-fns";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { api } from "~/trpc/react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  Users,
  Video,
  Plus,
  Play,
  ExternalLink,
  X,
  Download,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { MeetingForm } from "../meetings/components/MeetingForm";

const statusColors: Record<string, string> = {
  READY_TO_DEPLOY: "bg-purple-100 text-purple-800 border-purple-200",
  DEPLOYING: "bg-amber-100 text-amber-800 border-amber-200",
  JOINING_CALL: "bg-amber-100 text-amber-800 border-amber-200",
  IN_WAITING_ROOM: "bg-amber-100 text-amber-800 border-amber-200",
  IN_CALL: "bg-blue-100 text-blue-800 border-blue-200",
  CALL_ENDED: "bg-amber-100 text-amber-800 border-amber-200",
  DONE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  FATAL: "bg-red-100 text-red-800 border-red-200",
  default: "bg-gray-100 text-gray-800 border-gray-200",
};

const statusLabels: Record<string, string> = {
  READY_TO_DEPLOY: "Scheduled",
  DEPLOYING: "Deploying",
  JOINING_CALL: "Joining",
  IN_WAITING_ROOM: "Waiting",
  IN_CALL: "Recording",
  CALL_ENDED: "Processing",
  DONE: "Complete",
  FATAL: "Failed",
};

// Calendar day status colors for the dots/pills
const calendarStatusColors: Record<string, string> = {
  READY_TO_DEPLOY: "bg-purple-400",
  DEPLOYING: "bg-amber-400",
  JOINING_CALL: "bg-amber-400",
  IN_WAITING_ROOM: "bg-amber-400",
  IN_CALL: "bg-blue-400",
  CALL_ENDED: "bg-amber-400",
  DONE: "bg-emerald-400",
  FATAL: "bg-red-400",
  default: "bg-gray-400",
};

interface AttendeesModalProps {
  meetingId: number;
  meetingTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AttendeesModal({ meetingId, meetingTitle, open, onOpenChange }: AttendeesModalProps) {
  const { data: attendeesData, isLoading } = api.meetingAttendees.getByMeeting.useQuery(
    { botId: meetingId },
    { enabled: open }
  );

  const attendees = attendeesData?.attendees ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Attendees - {meetingTitle}
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : attendees.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No attendees added yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {attendees.map((attendee) => (
                <div
                  key={attendee.id}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Google Calendar Import Modal
interface GoogleCalendarImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: () => void;
}

function GoogleCalendarImportModal({ open, onOpenChange, onImportSuccess }: GoogleCalendarImportModalProps) {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [importingEventId, setImportingEventId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    meetingId?: number;
    attendeesCount?: number;
    message?: string;
  } | null>(null);

  const utils = api.useUtils();

  // Check if Google Calendar is connected
  const { data: connectionStatus, isLoading: checkingConnection } = api.googleCalendar.isConnected.useQuery(
    {},
    { enabled: open }
  );

  // Memoize date range to prevent infinite refetch loop
  const dateRange = useMemo(() => {
    const now = new Date();
    return {
      timeMin: now.toISOString(),
      timeMax: addDays(now, 30).toISOString(),
    };
  }, [open]); // Only recalculate when modal opens

  // Fetch calendar events for the next 30 days
  const { data: calendarEvents, isLoading: loadingEvents, error: eventsError } = api.googleCalendar.getEvents.useQuery(
    {
      timeMin: dateRange.timeMin,
      timeMax: dateRange.timeMax,
      maxResults: 50,
    },
    { 
      enabled: open && connectionStatus?.connected === true,
      staleTime: 60000, // Consider data fresh for 1 minute
      refetchOnWindowFocus: false,
    }
  );

  // Import event mutation
  const importEvent = api.googleCalendar.importEvent.useMutation({
    onSuccess: (result) => {
      setImportResult({
        success: true,
        meetingId: result.meetingId,
        attendeesCount: result.attendeesImported.length,
      });
      setImportingEventId(null);
      // Invalidate meetings query to refresh the calendar
      void utils.bots.getUserMeetings.invalidate();
      onImportSuccess();
    },
    onError: (error) => {
      setImportResult({
        success: false,
        message: error.message,
      });
      setImportingEventId(null);
    },
  });

  const handleImport = (eventId: string) => {
    setImportingEventId(eventId);
    setImportResult(null);
    importEvent.mutate({ eventId, importAttendees: true });
  };

  const handleConnectGoogle = () => {
    void signIn("google", { callbackUrl: "/calendar" });
  };

  const handleClose = () => {
    setSelectedEventId(null);
    setImportResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Import from Google Calendar
          </DialogTitle>
          <DialogDescription>
            Select a calendar event to import as a meeting with attendees
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {checkingConnection ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !connectionStatus?.connected ? (
            <div className="text-center py-12">
              <CalendarIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="font-semibold text-lg mb-2">Connect Google Calendar</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Connect your Google account to import calendar events and automatically add attendees to your meetings.
              </p>
              <Button onClick={handleConnectGoogle} className="gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Connect Google Account
              </Button>
            </div>
          ) : loadingEvents ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : eventsError ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <p className="text-red-600 font-medium">Failed to load calendar events</p>
              <p className="text-muted-foreground text-sm mt-1">{eventsError.message}</p>
              <Button variant="outline" onClick={handleConnectGoogle} className="mt-4">
                Reconnect Google Account
              </Button>
            </div>
          ) : !calendarEvents || calendarEvents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">No upcoming events</p>
              <p className="text-sm mt-1">No calendar events found in the next 30 days</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Import Result Banner */}
              {importResult && (
                <div className={`p-3 rounded-lg mb-4 ${
                  importResult.success 
                    ? "bg-green-50 border border-green-200" 
                    : "bg-red-50 border border-red-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {importResult.success ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-green-800 font-medium">
                          Meeting imported successfully with {importResult.attendeesCount} attendee{importResult.attendeesCount !== 1 ? "s" : ""}!
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <span className="text-red-800 font-medium">
                          {importResult.message ?? "Failed to import event"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {calendarEvents.map((event) => {
                const eventDate = event.start.dateTime 
                  ? new Date(event.start.dateTime) 
                  : event.start.date 
                    ? new Date(event.start.date) 
                    : null;
                const attendeeCount = event.attendees?.filter(a => !a.self).length ?? 0;
                const hasMeetingLink = Boolean(event.hangoutLink);
                const isImporting = importingEventId === event.id;

                return (
                  <div
                    key={event.id}
                    className={`p-4 border rounded-lg transition-all ${
                      selectedEventId === event.id 
                        ? "border-primary bg-primary/5" 
                        : "hover:border-muted-foreground/30 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{event.summary ?? "Untitled Event"}</h4>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          {eventDate && (
                            <span>{format(eventDate, "MMM d, yyyy 'at' h:mm a")}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          {attendeeCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {attendeeCount} attendee{attendeeCount !== 1 ? "s" : ""}
                            </Badge>
                          )}
                          {hasMeetingLink && (
                            <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                              <Video className="h-3 w-3 mr-1" />
                              Google Meet
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleImport(event.id)}
                        disabled={isImporting}
                        className="shrink-0"
                      >
                        {isImporting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-1" />
                            Import
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Show attendees preview */}
                    {event.attendees && event.attendees.length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Attendees to import:</p>
                        <div className="flex flex-wrap gap-1">
                          {event.attendees.filter(a => !a.self).slice(0, 5).map((attendee, idx) => (
                            <Badge 
                              key={idx} 
                              variant="outline" 
                              className="text-xs font-normal"
                            >
                              {attendee.displayName ?? attendee.email}
                            </Badge>
                          ))}
                          {event.attendees.filter(a => !a.self).length > 5 && (
                            <Badge variant="outline" className="text-xs font-normal">
                              +{event.attendees.filter(a => !a.self).length - 5} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [attendeesModal, setAttendeesModal] = useState<{ meetingId: number; meetingTitle: string } | null>(null);
  const [showGoogleCalendarImport, setShowGoogleCalendarImport] = useState(false);

  const utils = api.useUtils();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/calendar");
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
    data: meetingsData, 
    isLoading,
    error,
  } = api.bots.getUserMeetings.useQuery(
    { limit: 100, offset: 0 },
    { 
      enabled: !!session && isGC,
      refetchInterval: 30000,
    }
  );

  const meetings = useMemo(() => meetingsData?.meetings ?? [], [meetingsData?.meetings]);

  // Group meetings by scheduled date (startTime)
  const meetingsByDate = useMemo(() => {
    const grouped: Record<string, typeof meetings> = {};
    meetings.forEach((meeting) => {
      // Use scheduledDate if available, otherwise fall back to createdAt
      const dateToUse = meeting.scheduledDate ?? meeting.createdAt;
      if (dateToUse) {
        const dateKey = format(new Date(dateToUse), "yyyy-MM-dd");
        const group = grouped[dateKey];
        if (!group) {
          grouped[dateKey] = [meeting];
        } else {
          group.push(meeting);
        }
      }
    });
    return grouped;
  }, [meetings]);

  // Get days in current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get day of week for the first day (0 = Sunday)
  const startDayOfWeek = monthStart.getDay();

  // Get meetings for selected date
  const selectedDateMeetings = selectedDate 
    ? meetingsByDate[format(selectedDate, "yyyy-MM-dd")] ?? []
    : [];

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meeting Calendar</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and manage your meetings with attendees
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => setShowGoogleCalendarImport(true)}
          >
            <CalendarIcon className="h-4 w-4 mr-2" />
            Import from Google
          </Button>
          <Button 
            onClick={() => setShowMeetingForm(!showMeetingForm)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Meeting
          </Button>
        </div>
      </div>

      {/* Meeting Form */}
      {showMeetingForm && (
        <Card className="border-2 border-dashed border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              Schedule New Meeting
              {selectedDate && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  for {format(selectedDate, "MMMM d, yyyy")}
                </span>
              )}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setShowMeetingForm(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <MeetingForm 
              defaultDate={selectedDate ?? undefined}
              onSuccess={() => setShowMeetingForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Main Grid - Calendar takes more space */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar View */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
            <CardTitle className="text-base font-medium">{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : error ? (
              <div className="rounded-lg bg-red-50 p-4 text-red-600 border border-red-200">
                Failed to load meetings: {error.message}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {/* Day headers */}
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {day}
                  </div>
                ))}
                
                {/* Empty cells for days before month starts */}
                {Array.from({ length: startDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="p-2 min-h-[80px]" />
                ))}
                
                {/* Calendar days */}
                {daysInMonth.map((day) => {
                  const dateKey = format(day, "yyyy-MM-dd");
                  const dayMeetings = meetingsByDate[dateKey] ?? [];
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <button
                      key={dateKey}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        p-2 min-h-[80px] text-left rounded-lg border transition-colors
                        ${isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-transparent hover:bg-muted/50"
                        }
                        ${isToday && !isSelected ? "bg-muted/40" : ""}
                      `}
                    >
                      <div className={`
                        text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full
                        ${isToday ? "bg-primary text-primary-foreground" : ""}
                        ${isSelected && !isToday ? "bg-primary/10 text-primary" : ""}
                      `}>
                        {format(day, "d")}
                      </div>
                      {dayMeetings.length > 0 && (
                        <div className="space-y-0.5">
                          {dayMeetings.slice(0, 2).map((meeting) => (
                            <div
                              key={meeting.id}
                              className={`text-xs px-1.5 py-0.5 rounded truncate font-medium ${
                                calendarStatusColors[meeting.status] ?? calendarStatusColors.default
                              } text-white`}
                            >
                              {meeting.meetingTitle}
                            </div>
                          ))}
                          {dayMeetings.length > 2 && (
                            <div className="text-xs text-muted-foreground pl-1">
                              +{dayMeetings.length - 2} more
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected Date Details - Fixed height matching calendar, scrollable content */}
        <Card className="flex flex-col h-fit lg:max-h-[580px]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 shrink-0 border-b">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Video className="h-4 w-4 text-muted-foreground" />
              {selectedDate 
                ? format(selectedDate, "EEE, MMM d, yyyy")
                : "Select a date"
              }
            </CardTitle>
            {selectedDate && (
              <Button 
                size="sm" 
                variant="outline"
                className="h-8"
                onClick={() => setShowMeetingForm(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-y-auto p-4">
            {!selectedDate ? (
              <div className="text-center py-12 text-muted-foreground">
                <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium">No date selected</p>
                <p className="text-sm mt-1">Click on a date to view meetings</p>
              </div>
            ) : selectedDateMeetings.length === 0 ? (
              <div className="text-center py-12">
                <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                <p className="text-muted-foreground font-medium mb-4">
                  No meetings on this date
                </p>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMeetingForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule a meeting
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDateMeetings.map((meeting) => {
                  const isScheduled = meeting.status === "READY_TO_DEPLOY";
                  return (
                    <div 
                      key={meeting.id} 
                      className={`p-3 border rounded-xl transition-all hover:shadow-md ${
                        isScheduled 
                          ? "border-purple-200 bg-gradient-to-br from-purple-50 to-white" 
                          : "bg-gradient-to-br from-muted/30 to-white hover:border-muted-foreground/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold truncate text-sm">{meeting.meetingTitle}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {meeting.scheduledDate 
                              ? format(new Date(meeting.scheduledDate), "h:mm a")
                              : meeting.createdAt && format(new Date(meeting.createdAt), "h:mm a")
                            }
                          </p>
                        </div>
                        <Badge 
                          variant="outline"
                          className={`text-xs shrink-0 ${statusColors[meeting.status] ?? statusColors.default}`}
                        >
                          {statusLabels[meeting.status] ?? meeting.status}
                        </Badge>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs flex-1"
                          onClick={(e) => {
                            e.preventDefault();
                            setAttendeesModal({ meetingId: meeting.id, meetingTitle: meeting.meetingTitle });
                          }}
                        >
                          <Users className="h-3 w-3 mr-1" />
                          View attendees
                        </Button>
                        {isScheduled && (
                          <Link href={`/meetings/${meeting.id}`} className="flex-1">
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 text-xs w-full bg-purple-600 hover:bg-purple-700"
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Join
                            </Button>
                          </Link>
                        )}
                        {!isScheduled && (
                          <Link href={`/meetings/${meeting.id}`} className="flex-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs w-full"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Details
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Attendees Modal */}
      {attendeesModal && (
        <AttendeesModal
          meetingId={attendeesModal.meetingId}
          meetingTitle={attendeesModal.meetingTitle}
          open={true}
          onOpenChange={(open) => {
            if (!open) setAttendeesModal(null);
          }}
        />
      )}

      {/* Google Calendar Import Modal */}
      <GoogleCalendarImportModal
        open={showGoogleCalendarImport}
        onOpenChange={setShowGoogleCalendarImport}
        onImportSuccess={() => {
          void utils.bots.getUserMeetings.invalidate();
        }}
      />
    </div>
  );
}
