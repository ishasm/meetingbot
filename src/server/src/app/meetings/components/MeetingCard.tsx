"use client";

import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { FileText, PlayCircle, CheckCircle, Clock, AlertCircle, Loader2 } from "lucide-react";

interface MeetingCardProps {
  meeting: {
    id: number;
    meetingTitle: string;
    platform: string | null;
    status: string;
    createdAt: Date | null;
    hasTranscription: boolean;
    hasRecording: boolean;
  };
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  READY_TO_DEPLOY: { label: "Preparing", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  DEPLOYING: { label: "Deploying", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  JOINING_CALL: { label: "Joining", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  IN_WAITING_ROOM: { label: "In Waiting Room", variant: "outline", icon: <Clock className="h-3 w-3" /> },
  IN_CALL: { label: "Recording", variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  CALL_ENDED: { label: "Processing", variant: "secondary", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  DONE: { label: "Complete", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  FATAL: { label: "Failed", variant: "destructive", icon: <AlertCircle className="h-3 w-3" /> },
};

const platformLogos: Record<string, string> = {
  google: "/platform-logos/google.svg",
  zoom: "/platform-logos/zoom.svg",
  teams: "/platform-logos/teams.svg",
};

export function MeetingCard({ meeting }: MeetingCardProps) {
  const status = statusConfig[meeting.status] ?? { 
    label: meeting.status, 
    variant: "outline" as const, 
    icon: null 
  };

  const timeAgo = meeting.createdAt
    ? formatDistanceToNow(new Date(meeting.createdAt), { addSuffix: true })
    : "Unknown";

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {meeting.platform && platformLogos[meeting.platform] && (
              <Image
                src={platformLogos[meeting.platform]}
                alt={meeting.platform}
                width={20}
                height={20}
              />
            )}
            <CardTitle className="text-lg">{meeting.meetingTitle}</CardTitle>
          </div>
          <Badge variant={status.variant} className="flex items-center gap-1">
            {status.icon}
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-2">
        <p className="text-sm text-muted-foreground">{timeAgo}</p>
        <div className="flex items-center gap-4 mt-2">
          {meeting.hasRecording && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <PlayCircle className="h-4 w-4" />
              Recording available
            </span>
          )}
          {meeting.hasTranscription && (
            <span className="flex items-center gap-1 text-sm text-blue-600">
              <FileText className="h-4 w-4" />
              Transcription available
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Link href={`/meetings/${meeting.id}`} className="w-full">
          <Button variant="outline" className="w-full">
            View Details
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
