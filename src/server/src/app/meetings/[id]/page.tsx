"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow, format } from "date-fns";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { api } from "~/trpc/react";
import { TranscriptViewer } from "../components/TranscriptViewer";
import { ActionItemsList } from "../components/ActionItemsList";
import { 
  ArrowLeft, 
  Video, 
  Clock, 
  Calendar,
  PlayCircle,
  Download,
  CheckCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  READY_TO_DEPLOY: { label: "Preparing", variant: "secondary", icon: <Clock className="h-4 w-4" /> },
  DEPLOYING: { label: "Deploying", variant: "secondary", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  JOINING_CALL: { label: "Joining", variant: "secondary", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  IN_WAITING_ROOM: { label: "In Waiting Room", variant: "outline", icon: <Clock className="h-4 w-4" /> },
  IN_CALL: { label: "Recording", variant: "default", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  CALL_ENDED: { label: "Processing", variant: "secondary", icon: <Loader2 className="h-4 w-4 animate-spin" /> },
  DONE: { label: "Complete", variant: "default", icon: <CheckCircle className="h-4 w-4" /> },
  FATAL: { label: "Failed", variant: "destructive", icon: <AlertCircle className="h-4 w-4" /> },
};

const platformLogos: Record<string, string> = {
  google: "/platform-logos/google.svg",
  zoom: "/platform-logos/zoom.svg",
  teams: "/platform-logos/teams.svg",
};

export default function MeetingDetailPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = Number(params.id);

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push(`/auth/signin?callbackUrl=/meetings/${id}`);
    }
  }, [authStatus, router, id]);

  const { data: bot, isLoading, error } = api.bots.getBot.useQuery(
    { id },
    { 
      enabled: !!session && !isNaN(id),
      refetchInterval: (data) => {
        // Only refetch if bot is still in progress
        if (data?.status && ["DONE", "FATAL"].includes(data.status)) {
          return false;
        }
        return 5000; // Refetch every 5 seconds for active bots
      },
    }
  );

  const { data: recordingData } = api.bots.getSignedRecordingUrl.useQuery(
    { id },
    { enabled: !!session && !!bot?.recording }
  );

  const { data: audioData } = api.bots.getSignedAudioUrl.useQuery(
    { id },
    { enabled: !!session && !!bot?.mp3 }
  );

  const { data: transcriptionData } = api.bots.getTranscription.useQuery(
    { id },
    { enabled: !!session && !isNaN(id) }
  );

  if (authStatus === "loading" || isLoading) {
    return (
      <div className="space-y-6 py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (error) {
    return (
      <div className="py-6">
        <div className="rounded-md bg-red-50 p-4 text-red-600">
          {error.message === "Bot not found" 
            ? "Meeting not found or you don't have access to it."
            : `Error: ${error.message}`}
        </div>
        <Link href="/meetings" className="mt-4 inline-block">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Meetings
          </Button>
        </Link>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="py-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Meeting not found</p>
        </div>
      </div>
    );
  }

  const status = statusConfig[bot.status] ?? { 
    label: bot.status, 
    variant: "outline" as const, 
    icon: null 
  };

  const platform = bot.meetingInfo?.platform;
  const hasRecording = !!bot.recording;
  const hasTranscription = !!transcriptionData?.transcription;

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/meetings">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
      </div>

      {/* Meeting Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {platform && platformLogos[platform] && (
                <Image
                  src={platformLogos[platform]}
                  alt={platform}
                  width={32}
                  height={32}
                />
              )}
              <div>
                <CardTitle className="text-2xl">{bot.meetingTitle}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {bot.createdAt && (
                    <>
                      Created {formatDistanceToNow(new Date(bot.createdAt), { addSuffix: true })}
                      {" • "}
                      {format(new Date(bot.createdAt), "PPP 'at' p")}
                    </>
                  )}
                </p>
              </div>
            </div>
            <Badge variant={status.variant} className="flex items-center gap-1 text-sm">
              {status.icon}
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {/* Recording Download */}
            {hasRecording && recordingData?.recordingUrl && (
              <a 
                href={recordingData.recordingUrl} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button variant="outline">
                  <Video className="h-4 w-4 mr-2" />
                  Download Video
                </Button>
              </a>
            )}

            {/* Audio Download */}
            {bot.mp3 && audioData?.audioUrl && (
              <a 
                href={audioData.audioUrl} 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Audio
                </Button>
              </a>
            )}
          </div>

          {/* Video Player */}
          {hasRecording && recordingData?.recordingUrl && (
            <div className="mt-4">
              <video
                controls
                className="w-full max-h-96 rounded-lg bg-black"
                src={recordingData.recordingUrl}
              >
                Your browser does not support the video element.
              </video>
            </div>
          )}

          {/* Status message for in-progress meetings */}
          {!["DONE", "FATAL"].includes(bot.status) && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p>
                  {bot.status === "IN_CALL" 
                    ? "Recording in progress. This page will update automatically when the meeting ends."
                    : "Bot is connecting to the meeting. Please wait..."}
                </p>
              </div>
            </div>
          )}

          {/* Error message */}
          {bot.status === "FATAL" && bot.deploymentError && (
            <div className="mt-4 p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="h-5 w-5" />
                <p>{bot.deploymentError}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transcript Section */}
      {bot.status === "DONE" && (
        <TranscriptViewer botId={id} hasRecording={hasRecording} />
      )}

      {/* Action Items Section */}
      {bot.status === "DONE" && (
        <ActionItemsList botId={id} hasTranscription={hasTranscription} />
      )}
    </div>
  );
}
