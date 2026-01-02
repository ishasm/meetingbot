"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { Badge } from "~/components/ui/badge";
import { api } from "~/trpc/react";
import { FileText, Download, RefreshCw, Sparkles, Clock, User, Subtitles } from "lucide-react";

interface TranscriptViewerProps {
  botId: number;
  hasRecording: boolean;
}

type ViewMode = "segments" | "text" | "srt";

// Format seconds to readable timestamp (MM:SS or HH:MM:SS)
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Get a consistent color for a speaker name
function getSpeakerColor(speaker: string): string {
  const colors = [
    "bg-blue-100 text-blue-800 border-blue-200",
    "bg-green-100 text-green-800 border-green-200",
    "bg-purple-100 text-purple-800 border-purple-200",
    "bg-orange-100 text-orange-800 border-orange-200",
    "bg-pink-100 text-pink-800 border-pink-200",
    "bg-cyan-100 text-cyan-800 border-cyan-200",
    "bg-yellow-100 text-yellow-800 border-yellow-200",
    "bg-indigo-100 text-indigo-800 border-indigo-200",
  ];
  
  // Simple hash function to get consistent color for same speaker
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length] ?? colors[0]!;
}

export function TranscriptViewer({ botId, hasRecording }: TranscriptViewerProps) {
  const [showSummary, setShowSummary] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("segments");

  const { data: transcriptionData, isLoading: isLoadingTranscription } = 
    api.bots.getTranscription.useQuery({ id: botId });

  const { data: srtData } = api.bots.getSrt.useQuery({ id: botId });

  const transcribeMutation = api.bots.transcribeBot.useMutation({
    onSuccess: () => {
      void utils.bots.getTranscription.invalidate({ id: botId });
      void utils.bots.getSrt.invalidate({ id: botId });
    },
  });

  const summaryMutation = api.bots.generateSummary.useMutation();

  const utils = api.useUtils();

  const handleTranscribe = () => {
    transcribeMutation.mutate({
      id: botId,
      speakerDiarization: true,
      saveToDatabase: true,
    });
  };

  const handleGenerateSummary = () => {
    summaryMutation.mutate({ id: botId });
    setShowSummary(true);
  };

  const handleDownloadSrt = () => {
    if (!srtData?.srt) return;
    
    const blob = new Blob([srtData.srt], { type: "text/srt" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = srtData.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!hasRecording) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Recording not yet available. Please wait for the meeting to end.</p>
        </CardContent>
      </Card>
    );
  }

  const hasSegments = transcriptionData?.transcriptionSegments && transcriptionData.transcriptionSegments.length > 0;
  const hasSrt = !!transcriptionData?.transcriptionSrt;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Transcript
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {!transcriptionData?.transcription && (
              <Button
                onClick={handleTranscribe}
                disabled={transcribeMutation.isPending}
                size="sm"
              >
                {transcribeMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Transcribing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Fetch Transcript
                  </>
                )}
              </Button>
            )}
            {transcriptionData?.transcription && (
              <>
                <Button
                  onClick={handleGenerateSummary}
                  disabled={summaryMutation.isPending}
                  size="sm"
                  variant="outline"
                >
                  {summaryMutation.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Summary
                    </>
                  )}
                </Button>
                {hasSrt && (
                  <Button
                    onClick={handleDownloadSrt}
                    size="sm"
                    variant="outline"
                  >
                    <Subtitles className="h-4 w-4 mr-2" />
                    Download SRT
                  </Button>
                )}
              </>
            )}
          </div>
        </CardHeader>

        {/* View Mode Tabs */}
        {transcriptionData?.transcription && (
          <div className="px-6 pb-2">
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
              <button
                onClick={() => setViewMode("segments")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === "segments"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <User className="h-4 w-4 inline mr-1.5" />
                Speakers
              </button>
              <button
                onClick={() => setViewMode("text")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === "text"
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="h-4 w-4 inline mr-1.5" />
                Plain Text
              </button>
              {hasSrt && (
                <button
                  onClick={() => setViewMode("srt")}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    viewMode === "srt"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Subtitles className="h-4 w-4 inline mr-1.5" />
                  SRT
                </button>
              )}
            </div>
          </div>
        )}

        <CardContent>
          {isLoadingTranscription ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : transcribeMutation.isPending ? (
            <div className="text-center py-8">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
              <p className="text-muted-foreground">
                Transcribing audio... This may take a few minutes.
              </p>
            </div>
          ) : transcriptionData?.transcription ? (
            <div className="prose prose-sm max-w-none">
              {/* Segments View - with speaker badges and timestamps */}
              {viewMode === "segments" && hasSegments && (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  {transcriptionData.transcriptionSegments!.map((segment, index) => (
                    <div 
                      key={index} 
                      className="flex gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex flex-col items-start gap-1 min-w-[100px]">
                        {segment.speaker && (
                          <Badge 
                            variant="outline" 
                            className={`text-xs font-medium ${getSpeakerColor(segment.speaker)}`}
                          >
                            {segment.speaker}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimestamp(segment.start)}
                        </span>
                      </div>
                      <p className="flex-1 text-sm leading-relaxed">{segment.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Segments View fallback when no segments but has transcription */}
              {viewMode === "segments" && !hasSegments && (
                <div className="bg-muted/50 rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {transcriptionData.transcription}
                </div>
              )}

              {/* Plain Text View */}
              {viewMode === "text" && (
                <div className="bg-muted/50 rounded-lg p-4 max-h-[500px] overflow-y-auto whitespace-pre-wrap">
                  {transcriptionData.transcription}
                </div>
              )}

              {/* SRT View */}
              {viewMode === "srt" && hasSrt && (
                <div className="bg-slate-900 text-slate-100 rounded-lg p-4 max-h-[500px] overflow-y-auto font-mono text-sm">
                  <pre className="whitespace-pre-wrap">{transcriptionData.transcriptionSrt}</pre>
                </div>
              )}

              {transcriptionData.transcriptionProvider && (
                <p className="text-xs text-muted-foreground mt-3">
                  Transcribed using {transcriptionData.transcriptionProvider}
                  {hasSegments && ` • ${transcriptionData.transcriptionSegments!.length} segments`}
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No transcript available yet. Click &quot;Fetch Transcript&quot; to generate one.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {showSummary && (summaryMutation.isPending || summaryMutation.data) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Meeting Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summaryMutation.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : summaryMutation.data ? (
              <div className="prose prose-sm max-w-none">
                <div className="bg-primary/5 rounded-lg p-4 whitespace-pre-wrap">
                  {summaryMutation.data.summary}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {summaryMutation.error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          Failed to generate summary: {summaryMutation.error.message}
        </div>
      )}

      {transcribeMutation.error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          Failed to transcribe: {transcribeMutation.error.message}
        </div>
      )}
    </div>
  );
}
