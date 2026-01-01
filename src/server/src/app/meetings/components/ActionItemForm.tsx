"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";

interface ActionItemFormProps {
  botId: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ActionItemForm({ botId, onSuccess, onCancel }: ActionItemFormProps) {
  const [content, setContent] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");

  const utils = api.useUtils();

  const createMutation = api.actionItems.createActionItem.useMutation({
    onSuccess: () => {
      setContent("");
      setAssignee("");
      setPriority("medium");
      utils.actionItems.getActionItems.invalidate({ botId });
      onSuccess?.();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) return;

    createMutation.mutate({
      botId,
      content: content.trim(),
      assignee: assignee.trim() || undefined,
      priority,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/50">
      <div className="space-y-2">
        <Label htmlFor="content">Action Item</Label>
        <Input
          id="content"
          placeholder="Enter action item description"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          disabled={createMutation.isPending}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="assignee">Assignee (Optional)</Label>
          <Input
            id="assignee"
            placeholder="Who is responsible?"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            disabled={createMutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            disabled={createMutation.isPending}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!content.trim() || createMutation.isPending}>
          {createMutation.isPending ? "Adding..." : "Add Action Item"}
        </Button>
      </div>

      {createMutation.error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
          {createMutation.error.message}
        </div>
      )}
    </form>
  );
}
