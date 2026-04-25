"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Calendar } from "~/components/ui/calendar";
import { Checkbox } from "~/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// Validation functions for meeting URLs
const isGoogleMeetUrl = (url: string) => {
  return /^((https:\/\/)?meet\.google\.com\/)?[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url) ||
    url.includes("meet.google.com");
};

const isZoomUrl = (url: string) => {
  return /zoom\.us\/j\/\d+/.test(url);
};

const isTeamsUrl = (url: string) => {
  return url.includes("teams.microsoft.com") || url.includes("teams.live.com");
};

const detectPlatform = (url: string): "google" | "zoom" | "teams" | null => {
  if (isGoogleMeetUrl(url)) return "google";
  if (isZoomUrl(url)) return "zoom";
  if (isTeamsUrl(url)) return "teams";
  return null;
};

interface MeetingFormProps {
  onSuccess?: () => void;
  redirectToMeeting?: boolean;
  defaultDate?: Date;
}

export function MeetingForm({ onSuccess, redirectToMeeting = true, defaultDate }: MeetingFormProps) {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(defaultDate ?? new Date());
  const [enableRecording, setEnableRecording] = useState(true);
  const [enableVoiceAssistant, setEnableVoiceAssistant] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  // Update scheduled date when defaultDate prop changes
  useEffect(() => {
    if (defaultDate) {
      setScheduledDate(defaultDate);
    }
  }, [defaultDate]);

  const utils = api.useUtils();
  
  const createMeetingMutation = api.bots.createMeeting.useMutation({
    onSuccess: (data) => {
      setMeetingUrl("");
      setMeetingTitle("");
      setScheduledDate(new Date());
      setEnableRecording(true);
      setEnableVoiceAssistant(false);
      setErrorMessage(null);
      void utils.bots.getUserMeetings.invalidate();
      onSuccess?.();
      
      // Redirect to the meeting detail page
      if (redirectToMeeting && data?.id) {
        router.push(`/meetings/${data.id}`);
      }
    },
    onError: (error) => {
      setErrorMessage(error.message);
    },
  });

  const detectedPlatform = detectPlatform(meetingUrl);
  const platformLabels: Record<string, string> = {
    google: "Google Meet",
    zoom: "Zoom",
    teams: "Microsoft Teams",
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!meetingUrl.trim()) {
      setErrorMessage("Please enter a meeting URL");
      return;
    }

    // Normalize Google Meet URL
    let normalizedUrl = meetingUrl;
    if (detectedPlatform === "google" && !meetingUrl.startsWith("https://")) {
      normalizedUrl = meetingUrl.startsWith("meet.google.com")
        ? `https://${meetingUrl}`
        : `https://meet.google.com/${meetingUrl}`;
    }

    if (enableVoiceAssistant && detectedPlatform !== "google") {
      setErrorMessage("Voice assistant is currently only supported for Google Meet.");
      return;
    }

    createMeetingMutation.mutate({
      meetingUrl: normalizedUrl,
      meetingTitle: meetingTitle || undefined,
      scheduledDate: scheduledDate?.toISOString(),
      enableRecording,
      enableVoiceAssistant,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule a Meeting</CardTitle>
        <CardDescription>
          Enter a meeting URL to create a meeting. You can add attendees and agenda items before starting the recording.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meetingUrl">Meeting URL</Label>
            <Input
              id="meetingUrl"
              type="text"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              disabled={createMeetingMutation.isPending}
            />
            {detectedPlatform && (
              <p className="text-sm text-green-600">
                Detected: {platformLabels[detectedPlatform]}
              </p>
            )}
            {meetingUrl && !detectedPlatform && (
              <p className="text-sm text-orange-600">
                Unknown meeting format. Please enter a valid Google Meet, Zoom, or Teams URL.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetingTitle">Meeting Title (Optional)</Label>
            <Input
              id="meetingTitle"
              type="text"
              placeholder="Weekly Standup"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              disabled={createMeetingMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Scheduled Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !scheduledDate && "text-muted-foreground"
                  )}
                  disabled={createMeetingMutation.isPending}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduledDate ? format(scheduledDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={setScheduledDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="enableRecording"
                checked={enableRecording}
                onCheckedChange={(v) => setEnableRecording(v === true)}
                disabled={createMeetingMutation.isPending}
              />
              <div className="space-y-0.5">
                <Label htmlFor="enableRecording" className="cursor-pointer">
                  Record meeting
                </Label>
                <p className="text-xs text-muted-foreground">
                  Capture audio/video and upload to storage for transcription.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="enableVoiceAssistant"
                checked={enableVoiceAssistant}
                onCheckedChange={(v) => setEnableVoiceAssistant(v === true)}
                disabled={
                  createMeetingMutation.isPending || detectedPlatform !== "google"
                }
              />
              <div className="space-y-0.5">
                <Label htmlFor="enableVoiceAssistant" className="cursor-pointer">
                  AI voice assistant (beta)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Bot listens for &quot;Hey bot&quot; and replies with voice via
                  Gemini Live. Google Meet only.
                </p>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={!detectedPlatform || createMeetingMutation.isPending}
            className="w-full"
          >
            {createMeetingMutation.isPending
              ? "Creating Meeting..."
              : detectedPlatform
              ? `Create ${platformLabels[detectedPlatform]} Meeting`
              : "Enter a valid meeting URL"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
