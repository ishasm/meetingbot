"use client";

import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from "date-fns";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { FileText, PlayCircle, CheckCircle, Clock, AlertCircle, Loader2, Play, Calendar } from "lucide-react";

interface MeetingCardProps {
  meeting: {
    id: number;
    meetingTitle: string;
    platform: string | null;
    status: string;
    createdAt: Date | null;
    scheduledDate?: Date | null;
    hasTranscription: boolean;
    hasRecording: boolean;
  };
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  READY_TO_DEPLOY: { label: "Scheduled", variant: "outline", icon: <Clock className="h-3 w-3" /> },
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

  const isReadyToDeploy = meeting.status === "READY_TO_DEPLOY";
  const isInProgress = !["READY_TO_DEPLOY", "DONE", "FATAL"].includes(meeting.status);

  // Format the date display
  const scheduledDate = meeting.scheduledDate ? new Date(meeting.scheduledDate) : null;
  const createdDate = meeting.createdAt ? new Date(meeting.createdAt) : null;
  const displayDate = scheduledDate ?? createdDate;
  
  let dateDisplay = "Unknown";
  if (displayDate) {
    if (isReadyToDeploy && scheduledDate) {
      // For scheduled meetings, show the scheduled date prominently
      if (isToday(scheduledDate)) {
        dateDisplay = "Today";
      } else if (isTomorrow(scheduledDate)) {
        dateDisplay = "Tomorrow";
      } else if (isPast(scheduledDate)) {
        dateDisplay = format(scheduledDate, "MMM d, yyyy");
      } else {
        dateDisplay = format(scheduledDate, "MMM d, yyyy");
      }
    } else {
      // For other statuses, show relative time
      dateDisplay = formatDistanceToNow(displayDate, { addSuffix: true });
    }
  }

  return (
    <Card className={`hover:shadow-md transition-shadow ${isReadyToDeploy ? "border-primary/50 bg-primary/5" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {meeting.platform && platformLogos[meeting.platform] && (
              <Image
                src={platformLogos[meeting.platform]!}
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
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          {isReadyToDeploy && scheduledDate && <Calendar className="h-3 w-3" />}
          {dateDisplay}
        </p>
        <div className="flex items-center gap-4 mt-2">
          {isReadyToDeploy && (
            <span className="flex items-center gap-1 text-sm text-primary">
              <Play className="h-4 w-4" />
              Ready to join
            </span>
          )}
          {isInProgress && (
            <span className="flex items-center gap-1 text-sm text-amber-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              In progress
            </span>
          )}
          {meeting.hasRecording && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <PlayCircle className="h-4 w-4" />
              Recording
            </span>
          )}
          {meeting.hasTranscription && (
            <span className="flex items-center gap-1 text-sm text-blue-600">
              <FileText className="h-4 w-4" />
              Transcript
            </span>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Link href={`/meetings/${meeting.id}`} className="w-full">
          {isReadyToDeploy ? (
            <Button className="w-full">
              <Play className="h-4 w-4 mr-2" />
              Join & Record
            </Button>
          ) : (
            <Button variant="outline" className="w-full">
              View Details
            </Button>
          )}
        </Link>
      </CardFooter>
    </Card>
  );
}
