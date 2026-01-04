"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Input } from "~/components/ui/input";
import { RichTextEditor } from "~/components/ui/rich-text-editor";
import { api } from "~/trpc/react";
import { ListTodo, Sparkles, Trash2, RefreshCw, Plus, User, ChevronDown, Copy, Check } from "lucide-react";
import { ActionItemForm } from "./ActionItemForm";

interface ActionItemsListProps {
  botId: number;
  hasTranscription: boolean;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200",
};

const priorityOptions: { value: "low" | "medium" | "high"; label: string; color: string }[] = [
  { value: "high", label: "High", color: "text-red-600" },
  { value: "medium", label: "Medium", color: "text-yellow-600" },
  { value: "low", label: "Low", color: "text-green-600" },
];

interface EditableActionItemProps {
  item: {
    id: number;
    content: string;
    assignee: string | null;
    priority: string | null;
    isCompleted: boolean | null;
  };
  onUpdate: (id: number, updates: { content?: string; assignee?: string; priority?: "low" | "medium" | "high"; isCompleted?: boolean }) => void;
  onDelete: (id: number) => void;
  isUpdating: boolean;
}

function EditableActionItem({ item, onUpdate, onDelete, isUpdating }: EditableActionItemProps) {
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [isEditingAssignee, setIsEditingAssignee] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [editedContent, setEditedContent] = useState(item.content);
  const [editedAssignee, setEditedAssignee] = useState(item.assignee ?? "");

  const handleContentSave = useCallback(() => {
    if (editedContent.trim() && editedContent !== item.content) {
      onUpdate(item.id, { content: editedContent.trim() });
    }
    setIsEditingContent(false);
  }, [editedContent, item.content, item.id, onUpdate]);

  const handleAssigneeSave = useCallback(() => {
    if (editedAssignee !== (item.assignee ?? "")) {
      onUpdate(item.id, { assignee: editedAssignee.trim() });
    }
    setIsEditingAssignee(false);
  }, [editedAssignee, item.assignee, item.id, onUpdate]);

  const handlePriorityChange = (priority: "low" | "medium" | "high") => {
    onUpdate(item.id, { priority });
    setShowPriorityMenu(false);
  };

  const handleToggleComplete = () => {
    onUpdate(item.id, { isCompleted: !item.isCompleted });
  };

  return (
    <div
      className={`group p-3 rounded-lg border transition-all mb-2 ${
        item.isCompleted ? "bg-muted/50" : "bg-background hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <Checkbox
          checked={item.isCompleted ?? false}
          onCheckedChange={handleToggleComplete}
          className="mt-1.5"
          disabled={isUpdating}
        />

        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Editable Content */}
          {isEditingContent ? (
            <textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              onBlur={handleContentSave}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleContentSave();
                }
                if (e.key === "Escape") {
                  setEditedContent(item.content);
                  setIsEditingContent(false);
                }
              }}
              className="w-full p-2 text-sm border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              autoFocus
              disabled={isUpdating}
            />
          ) : (
            <p
              onClick={() => !item.isCompleted && setIsEditingContent(true)}
              className={`text-sm rounded px-2 py-1 -mx-2 -my-1 transition-colors min-h-[24px] whitespace-pre-wrap ${
                item.isCompleted 
                  ? "line-through text-muted-foreground cursor-default" 
                  : "cursor-text hover:bg-muted/50"
              }`}
            >
              {item.content}
            </p>
          )}

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Assignee */}
            <div className="flex items-center gap-1">
              <User className="h-3 w-3 text-muted-foreground" />
              {isEditingAssignee ? (
                <Input
                  value={editedAssignee}
                  onChange={(e) => setEditedAssignee(e.target.value)}
                  onBlur={handleAssigneeSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAssigneeSave();
                    }
                    if (e.key === "Escape") {
                      setEditedAssignee(item.assignee ?? "");
                      setIsEditingAssignee(false);
                    }
                  }}
                  className="h-6 text-xs w-32"
                  placeholder="Assign to..."
                  autoFocus
                  disabled={isUpdating}
                />
              ) : (
                <button
                  onClick={() => setIsEditingAssignee(true)}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  disabled={isUpdating}
                >
                  {item.assignee ?? "Unassigned"}
                </button>
              )}
            </div>

            {/* Priority Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowPriorityMenu(!showPriorityMenu)}
                className="flex items-center gap-1"
                disabled={isUpdating}
              >
                <Badge 
                  className={`${priorityColors[item.priority ?? "medium"] ?? priorityColors.medium} cursor-pointer hover:opacity-80`} 
                  variant="outline"
                >
                  {item.priority ?? "medium"}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Badge>
              </button>
              {showPriorityMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowPriorityMenu(false)} 
                  />
                  <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg z-20 py-1 min-w-[100px]">
                    {priorityOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handlePriorityChange(option.value)}
                        className={`w-full px-3 py-1.5 text-left text-sm hover:bg-muted flex items-center gap-2 ${option.color}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          option.value === "high" ? "bg-red-500" :
                          option.value === "medium" ? "bg-yellow-500" : "bg-green-500"
                        }`} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delete Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("Are you sure you want to delete this action item?")) {
              onDelete(item.id);
            }
          }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          disabled={isUpdating}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function ActionItemsList({ botId, hasTranscription }: ActionItemsListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const handleUpdate = (id: number, updates: { content?: string; assignee?: string; priority?: "low" | "medium" | "high"; isCompleted?: boolean }) => {
    updateMutation.mutate({ id, ...updates });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate({ id });
  };

  const handleGenerate = () => {
    generateMutation.mutate({ botId });
  };

  const handleCopyAll = useCallback(() => {
    const actionItems = data?.actionItems ?? [];
    const text = actionItems
      .map((item, index) => {
        const status = item.isCompleted ? "[✓]" : "[ ]";
        const assignee = item.assignee ? ` (@${item.assignee})` : "";
        const priority = item.priority ? ` [${item.priority}]` : "";
        return `${index + 1}. ${status} ${item.content}${assignee}${priority}`;
      })
      .join("\n");
    
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch((err) => {
      console.error("Failed to copy:", err);
    });
  }, [data?.actionItems]);

  const actionItems = data?.actionItems ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="h-5 w-5" />
          Action Items
          {actionItems.length > 0 && (
            <Badge variant="secondary">{actionItems.length}</Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          {actionItems.length > 0 && (
            <Button
              onClick={handleCopyAll}
              size="sm"
              variant="outline"
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy All
                </>
              )}
            </Button>
          )}
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
              <div key={i} className="flex items-center gap-3 p-4 border rounded-lg">
                <Skeleton className="h-4 w-4" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
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
          <div className="space-y-0">
            {actionItems.map((item) => (
              <EditableActionItem
                key={item.id}
                item={item}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                isUpdating={updateMutation.isPending || deleteMutation.isPending}
              />
            ))}
          </div>
        )}

        {generateMutation.error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            Failed to generate action items: {generateMutation.error.message}
          </div>
        )}

        {updateMutation.error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            Failed to update action item: {updateMutation.error.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
