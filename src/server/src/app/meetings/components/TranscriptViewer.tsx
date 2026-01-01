"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { FileText, Download, RefreshCw, Sparkles } from "lucide-react";

interface TranscriptViewerProps {
  botId: number;
  hasRecording: boolean;
}

export function TranscriptViewer({ botId, hasRecording }: TranscriptViewerProps) {
  const [showSummary, setShowSummary] = useState(false);

  const { data: transcriptionData, isLoading: isLoadingTranscription } = 
    api.bots.getTranscription.useQuery({ id: botId });

  const transcribeMutation = api.bots.transcribeBot.useMutation({
    onSuccess: () => {
      utils.bots.getTranscription.invalidate({ id: botId });
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Transcript
          </CardTitle>
          <div className="flex gap-2">
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
            )}
          </div>
        </CardHeader>
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
              <div className="bg-muted/50 rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap">
                {transcriptionData.transcription}
              </div>
              {transcriptionData.transcriptionProvider && (
                <p className="text-xs text-muted-foreground mt-2">
                  Transcribed using {transcriptionData.transcriptionProvider}
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
