"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { MeetingForm } from "./components/MeetingForm";
import { MeetingCard } from "./components/MeetingCard";
import { Video, Sparkles } from "lucide-react";

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
      <div className="space-y-8">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
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
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Video className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Meetings</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">My Meetings</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Send a bot to record and transcribe your meetings automatically
          </p>
        </div>
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      </div>

      {/* Meeting Form */}
      <MeetingForm />

      {/* Scheduled Meetings Section */}
      {scheduledMeetings.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-gradient-to-b from-purple-500 to-purple-600" />
            <h2 className="text-xl font-semibold">Scheduled Meetings</h2>
            <span className="text-sm text-muted-foreground">Ready to join</span>
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
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-gradient-to-b from-primary to-primary/70" />
          <h2 className="text-xl font-semibold">
            {scheduledMeetings.length > 0 ? "Past Meetings" : "Recent Meetings"}
          </h2>
        </div>
        
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-red-600">
            Failed to load meetings: {error.message}
          </div>
        ) : otherMeetings.length === 0 && scheduledMeetings.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-2xl bg-muted/30">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
              <Video className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No meetings yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Enter a meeting URL above to schedule your first meeting with a recording bot
            </p>
          </div>
        ) : otherMeetings.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-2xl bg-muted/30">
            <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No past meetings yet. Your completed meetings will appear here.
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
