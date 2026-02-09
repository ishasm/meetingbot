"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingCard } from "./components/MeetingCard";
import { Video } from "lucide-react";

export default function MeetingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/meetings");
    }
  }, [status, router]);

  const { 
    data: meetingsData, 
    isLoading,
    error,
  } = api.bots.getUserMeetings.useQuery(
    { limit: 50, offset: 0 },
    { 
      enabled: !!session,
      refetchInterval: 10000, // Refetch every 10 seconds to update statuses
    }
  );

  if (status === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const meetings = meetingsData?.meetings ?? [];
  const scheduledMeetings = meetings.filter(m => m.status === "READY_TO_DEPLOY");
  const otherMeetings = meetings.filter(m => m.status !== "READY_TO_DEPLOY");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">My Meetings</h1>
        <p className="text-muted-foreground text-sm">
          Send a bot to record and transcribe your meetings
        </p>
      </div>

      {/* Meeting Form */}
      <MeetingForm />

      {/* Scheduled Meetings Section */}
      {scheduledMeetings.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-purple-500" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Scheduled</h2>
            <span className="text-xs text-muted-foreground">Ready to join</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {scheduledMeetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </div>
      )}

      {/* Recent Meetings */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-1 rounded-full bg-primary" />
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {scheduledMeetings.length > 0 ? "Past Meetings" : "Recent Meetings"}
          </h2>
        </div>
        
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-red-600 text-sm">
            Failed to load meetings: {error.message}
          </div>
        ) : otherMeetings.length === 0 && scheduledMeetings.length === 0 ? (
          <div className="text-center py-16 border border-dashed rounded-xl">
            <Video className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="text-sm font-medium mb-1">No meetings yet</h3>
            <p className="text-sm text-muted-foreground">
              Enter a meeting URL above to schedule your first meeting
            </p>
          </div>
        ) : otherMeetings.length === 0 ? (
          <div className="text-center py-12 border border-dashed rounded-xl">
            <p className="text-sm text-muted-foreground">
              No past meetings yet
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {otherMeetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
