"use client";

import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow, format } from "date-fns";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";
import { TranscriptViewer } from "../components/TranscriptViewer";
import { ActionItemsList } from "../components/ActionItemsList";
import { MeetingAttendees } from "../components/MeetingAttendees";
import { MeetingAgendaItems } from "../components/MeetingAgendaItems";
import { 
  ArrowLeft, 
  Video, 
  Clock, 
  Download,
  CheckCircle,
  Loader2,
  AlertCircle,
  Play,
  Edit2,
  ExternalLink,
  Save,
  X,
} from "lucide-react";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  READY_TO_DEPLOY: { label: "Scheduled", variant: "outline", icon: <Clock className="h-4 w-4" /> },
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

  const utils = api.useUtils();
  
  const { data: bot, isLoading, error } = api.bots.getBot.useQuery(
    { id },
    { 
      enabled: !!session && !isNaN(id),
      refetchInterval: (query) => {
        // Only refetch if bot is still in progress (not READY_TO_DEPLOY, DONE, or FATAL)
        const status = query.state.data?.status;
        if (status && ["READY_TO_DEPLOY", "DONE", "FATAL"].includes(status)) {
          return false;
        }
        return 5000; // Refetch every 5 seconds for active bots
      },
    }
  );

  // Join meeting mutation
  const joinMeetingMutation = api.bots.joinMeeting.useMutation({
    onSuccess: () => {
      void utils.bots.getBot.invalidate({ id });
    },
  });

  // Update meeting mutation
  const updateMeetingMutation = api.bots.updateMeeting.useMutation({
    onSuccess: () => {
      void utils.bots.getBot.invalidate({ id });
      setIsEditing(false);
    },
  });

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");

  // Initialize edit fields when bot data loads
  useEffect(() => {
    if (bot) {
      setEditTitle(bot.meetingTitle);
      setEditUrl(bot.meetingInfo?.meetingUrl ?? "");
    }
  }, [bot]);

  // Use proxy endpoints for media files (works with internal MinIO)
  const recordingUrl = bot?.recording ? `/api/bots/${id}/recording` : null;
  const audioUrl = bot?.mp3 ? `/api/bots/${id}/audio` : null;

  const { data: transcriptionData } = api.bots.getTranscription.useQuery(
    { id },
    { enabled: !!session && !isNaN(id) }
  );

  const handleJoinMeeting = () => {
    joinMeetingMutation.mutate({ id });
  };

  const handleSaveEdit = () => {
    updateMeetingMutation.mutate({
      id,
      meetingTitle: editTitle,
      meetingUrl: editUrl,
    });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (bot) {
      setEditTitle(bot.meetingTitle);
      setEditUrl(bot.meetingInfo?.meetingUrl ?? "");
    }
  };

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
  const meetingUrl = bot.meetingInfo?.meetingUrl;
  const hasRecording = !!bot.recording;
  const hasTranscription = !!transcriptionData?.transcription;
  const isGC = session?.user?.role === "gc";
  const isReadyToDeploy = bot.status === "READY_TO_DEPLOY";
  const isInProgress = !["READY_TO_DEPLOY", "DONE", "FATAL"].includes(bot.status);
  const isComplete = bot.status === "DONE";

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
                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="editTitle">Meeting Title</Label>
                      <Input
                        id="editTitle"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="editUrl">Meeting URL</Label>
                      <Input
                        id="editUrl"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={handleSaveEdit}
                        disabled={updateMeetingMutation.isPending}
                      >
                        {updateMeetingMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleCancelEdit}
                        disabled={updateMeetingMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                    {updateMeetingMutation.error && (
                      <p className="text-sm text-red-600">{updateMeetingMutation.error.message}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-2xl">{bot.meetingTitle}</CardTitle>
                      {isReadyToDeploy && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setIsEditing(true)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {isReadyToDeploy && bot.startTime ? (
                        <>
                          Scheduled for {format(new Date(bot.startTime), "PPP")}
                        </>
                      ) : bot.createdAt ? (
                        <>
                          Created {formatDistanceToNow(new Date(bot.createdAt), { addSuffix: true })}
                          {" • "}
                          {format(new Date(bot.createdAt), "PPP 'at' p")}
                        </>
                      ) : null}
                    </p>
                  </>
                )}
              </div>
            </div>
            {!isEditing && (
              <Badge variant={status.variant} className="flex items-center gap-1 text-sm">
                {status.icon}
                {status.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Meeting URL display */}
          {meetingUrl && !isEditing && (
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Meeting URL:</span>
                  <a 
                    href={meetingUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {meetingUrl}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* READY_TO_DEPLOY: Show Join Meeting button */}
          {isReadyToDeploy && !isEditing && (
            <div className="mb-4">
              <div className="p-6 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5 text-center">
                <h3 className="text-lg font-semibold mb-2">Ready to Record</h3>
                <p className="text-muted-foreground mb-4">
                  Click the button below to deploy the bot and start recording this meeting.
                </p>
                <Button 
                  size="lg" 
                  onClick={handleJoinMeeting}
                  disabled={joinMeetingMutation.isPending}
                  className="min-w-48"
                >
                  {joinMeetingMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Deploying Bot...
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 mr-2" />
                      Join Meeting & Start Recording
                    </>
                  )}
                </Button>
                {joinMeetingMutation.error && (
                  <p className="text-sm text-red-600 mt-2">{joinMeetingMutation.error.message}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            {/* Recording Download */}
            {hasRecording && recordingUrl && (
              <a 
                href={recordingUrl} 
                download
              >
                <Button variant="outline">
                  <Video className="h-4 w-4 mr-2" />
                  Download Video
                </Button>
              </a>
            )}

            {/* Audio Download */}
            {bot.mp3 && audioUrl && (
              <a 
                href={audioUrl} 
                download
              >
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download Audio
                </Button>
              </a>
            )}
          </div>

          {/* Video Player */}
          {hasRecording && recordingUrl && (
            <div className="mt-4">
              <video
                controls
                className="w-full max-h-96 rounded-lg bg-black"
                src={recordingUrl}
              >
                Your browser does not support the video element.
              </video>
            </div>
          )}

          {/* Status message for in-progress meetings */}
          {isInProgress && (
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

      {/* GC-Only: Meeting Attendees Section - Show for all statuses */}
      {isGC && (
        <MeetingAttendees botId={id} />
      )}

      {/* GC-Only: Agenda Items Section - Show for all statuses */}
      {isGC && (
        <MeetingAgendaItems botId={id} hasTranscription={hasTranscription} />
      )}

      {/* Transcript Section - Only for completed meetings */}
      {isComplete && (
        <TranscriptViewer botId={id} hasRecording={hasRecording} />
      )}

      {/* Action Items Section - Only for completed meetings */}
      {isComplete && (
        <ActionItemsList botId={id} hasTranscription={hasTranscription} />
      )}
    </div>
  );
}
