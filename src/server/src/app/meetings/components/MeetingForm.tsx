"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
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
}

export function MeetingForm({ onSuccess }: MeetingFormProps) {
  const [meetingUrl, setMeetingUrl] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const utils = api.useUtils();
  
  const createMeetingMutation = api.bots.createMeeting.useMutation({
    onSuccess: () => {
      setMeetingUrl("");
      setMeetingTitle("");
      setErrorMessage(null);
      void utils.bots.getUserMeetings.invalidate();
      onSuccess?.();
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

    createMeetingMutation.mutate({
      meetingUrl: normalizedUrl,
      meetingTitle: meetingTitle || undefined,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join a Meeting</CardTitle>
        <CardDescription>
          Enter a meeting URL and we&apos;ll send a bot to record and transcribe it
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

          <Button
            type="submit"
            disabled={!detectedPlatform || createMeetingMutation.isPending}
            className="w-full"
          >
            {createMeetingMutation.isPending
              ? "Sending Bot..."
              : detectedPlatform
              ? `Send Bot to ${platformLabels[detectedPlatform]}`
              : "Enter a valid meeting URL"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
