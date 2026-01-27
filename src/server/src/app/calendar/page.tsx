"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths } from "date-fns";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { api } from "~/trpc/react";
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight,
  Users,
  Video,
  Plus,
  Play,
} from "lucide-react";
import { MeetingForm } from "../meetings/components/MeetingForm";

const statusColors: Record<string, string> = {
  READY_TO_DEPLOY: "bg-purple-100 text-purple-800 border-purple-200",
  DEPLOYING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  JOINING_CALL: "bg-yellow-100 text-yellow-800 border-yellow-200",
  IN_WAITING_ROOM: "bg-yellow-100 text-yellow-800 border-yellow-200",
  IN_CALL: "bg-blue-100 text-blue-800 border-blue-200",
  CALL_ENDED: "bg-yellow-100 text-yellow-800 border-yellow-200",
  DONE: "bg-green-100 text-green-800 border-green-200",
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

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showMeetingForm, setShowMeetingForm] = useState(false);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-8 w-8" />
            Meeting Calendar
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage your meetings with attendees
          </p>
        </div>
        <Button onClick={() => setShowMeetingForm(!showMeetingForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Meeting
        </Button>
      </div>

      {showMeetingForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              Schedule New Meeting
              {selectedDate && (
                <span className="ml-2 text-base font-normal text-muted-foreground">
                  for {format(selectedDate, "MMMM d, yyyy")}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MeetingForm 
              defaultDate={selectedDate ?? undefined}
              onSuccess={() => setShowMeetingForm(false)}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendar View */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : error ? (
              <div className="rounded-md bg-red-50 p-4 text-red-600">
                Failed to load meetings: {error.message}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {/* Day headers */}
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
                
                {/* Empty cells for days before month starts */}
                {Array.from({ length: startDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="p-2" />
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
                        ${isSelected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"}
                        ${isToday ? "bg-blue-50" : ""}
                      `}
                    >
                      <div className={`text-sm font-medium ${isToday ? "text-blue-600" : ""}`}>
                        {format(day, "d")}
                      </div>
                      {dayMeetings.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {dayMeetings.slice(0, 2).map((meeting) => (
                            <div
                              key={meeting.id}
                              className={`text-xs px-1 py-0.5 rounded truncate ${
                                statusColors[meeting.status] ?? statusColors.default
                              }`}
                            >
                              {meeting.meetingTitle}
                            </div>
                          ))}
                          {dayMeetings.length > 2 && (
                            <div className="text-xs text-muted-foreground">
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

        {/* Selected Date Details */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              {selectedDate 
                ? format(selectedDate, "EEEE, MMMM d, yyyy")
                : "Select a date"
              }
            </CardTitle>
            {selectedDate && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => setShowMeetingForm(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedDate ? (
              <p className="text-muted-foreground text-center py-8">
                Click on a date to view meetings
              </p>
            ) : selectedDateMeetings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  No meetings on this date
                </p>
                <Button 
                  variant="outline"
                  onClick={() => setShowMeetingForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Schedule a meeting
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {selectedDateMeetings.map((meeting) => {
                  const isScheduled = meeting.status === "READY_TO_DEPLOY";
                  return (
                    <Link 
                      key={meeting.id} 
                      href={`/meetings/${meeting.id}`}
                      className="block"
                    >
                      <div className={`p-3 border rounded-lg hover:bg-muted/50 transition-colors ${
                        isScheduled ? "border-purple-200 bg-purple-50/50" : ""
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{meeting.meetingTitle}</h4>
                            <p className="text-sm text-muted-foreground">
                              {meeting.createdAt && format(new Date(meeting.createdAt), "h:mm a")}
                            </p>
                          </div>
                          <Badge 
                            variant="outline"
                            className={statusColors[meeting.status] ?? statusColors.default}
                          >
                            {statusLabels[meeting.status] ?? meeting.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            View attendees
                          </span>
                          {isScheduled && (
                            <span className="flex items-center gap-1 text-purple-600">
                              <Play className="h-4 w-4" />
                              Ready to join
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
