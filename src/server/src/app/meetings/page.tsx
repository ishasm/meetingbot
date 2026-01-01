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
      <div className="space-y-6 py-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const meetings = meetingsData?.meetings ?? [];

  return (
    <div className="space-y-6 py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Meetings</h1>
        <p className="text-muted-foreground mt-1">
          Send a bot to record and transcribe your meetings
        </p>
      </div>

      <MeetingForm />

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Meetings</h2>
        
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-md bg-red-50 p-4 text-red-600">
            Failed to load meetings: {error.message}
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-muted/50">
            <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No meetings yet</h3>
            <p className="text-muted-foreground">
              Enter a meeting URL above to send your first bot
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {meetings.map((meeting) => (
              <MeetingCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
