"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { api } from "~/trpc/react";
import { ListTodo, Sparkles, Trash2, RefreshCw, Plus } from "lucide-react";
import { ActionItemForm } from "./ActionItemForm";

interface ActionItemsListProps {
  botId: number;
  hasTranscription: boolean;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-green-100 text-green-800",
};

export function ActionItemsList({ botId, hasTranscription }: ActionItemsListProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  const utils = api.useUtils();

  const { data, isLoading } = api.actionItems.getActionItems.useQuery({ botId });

  const generateMutation = api.actionItems.generateActionItems.useMutation({
    onSuccess: () => {
      void utils.actionItems.getActionItems.invalidate({ botId });
    },
  });

  const updateMutation = api.actionItems.updateActionItem.useMutation({
    onSuccess: () => {
      void utils.actionItems.getActionItems.invalidate({ botId });
    },
  });

  const deleteMutation = api.actionItems.deleteActionItem.useMutation({
    onSuccess: () => {
      void utils.actionItems.getActionItems.invalidate({ botId });
    },
  });

  const handleToggleComplete = (id: number, isCompleted: boolean) => {
    updateMutation.mutate({ id, isCompleted: !isCompleted });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this action item?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleGenerate = () => {
    generateMutation.mutate({ botId });
  };

  const actionItems = data?.actionItems ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="h-5 w-5" />
          Action Items
          {actionItems.length > 0 && (
            <Badge variant="secondary">{actionItems.length}</Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            size="sm"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
          {hasTranscription && (
            <Button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              size="sm"
            >
              {generateMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate from Transcript
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showAddForm && (
          <div className="mb-4">
            <ActionItemForm
              botId={botId}
              onSuccess={() => setShowAddForm(false)}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        ) : generateMutation.isPending ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">
              Analyzing transcript and generating action items...
            </p>
          </div>
        ) : actionItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ListTodo className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No action items yet.</p>
            {hasTranscription ? (
              <p className="text-sm mt-2">
                Click &quot;Generate from Transcript&quot; to extract action items automatically.
              </p>
            ) : (
              <p className="text-sm mt-2">
                Transcribe the meeting first to generate action items.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {actionItems.map((item) => (
              <li
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  item.isCompleted ? "bg-muted/50 opacity-75" : "bg-background"
                }`}
              >
                <Checkbox
                  checked={item.isCompleted ?? false}
                  onCheckedChange={() => handleToggleComplete(item.id, item.isCompleted ?? false)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className={item.isCompleted ? "line-through text-muted-foreground" : ""}>
                    {item.content}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {item.assignee && (
                      <span className="text-xs text-muted-foreground">
                        Assigned to: {item.assignee}
                      </span>
                    )}
                    {item.priority && (
                      <Badge className={priorityColors[item.priority] ?? ""} variant="outline">
                        {item.priority}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(item.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {generateMutation.error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            Failed to generate action items: {generateMutation.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
