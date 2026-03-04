"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Calendar } from "~/components/ui/calendar";
import { DragDropContext, Droppable, Draggable, type DropResult, type DroppableProvided, type DraggableProvided, type DraggableStateSnapshot, type DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { api } from "~/trpc/react";
import { ListTodo, Sparkles, Trash2, RefreshCw, Plus, User, ChevronDown, Copy, Check, CalendarIcon, GripVertical, Tag, X, Settings2 } from "lucide-react";
import { format } from "date-fns";
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

const categoryColors: Record<string, string> = {
  "Policy": "bg-blue-50 text-blue-700 border-blue-200",
  "Budget Approval": "bg-amber-50 text-amber-700 border-amber-200",
  "Follow-up": "bg-violet-50 text-violet-700 border-violet-200",
  "General": "bg-gray-50 text-gray-700 border-gray-200",
};

const CATEGORY_OPTIONS = ["Policy", "Budget Approval", "Follow-up", "General"] as const;

type CategoryType = "Policy" | "Budget Approval" | "Follow-up" | "General" | null;
type UpdatePayload = { content?: string; assignee?: string; priority?: "low" | "medium" | "high"; category?: CategoryType; dueDate?: Date | null; isCompleted?: boolean };

interface TagData {
  id: number;
  name: string;
  color: string;
  createdAt: Date | null;
}

interface EditableActionItemProps {
  item: {
    id: number;
    content: string;
    assignee: string | null;
    priority: string | null;
    category?: string | null;
    dueDate?: Date | string | null;
    isCompleted: boolean | null;
  };
  onUpdate: (id: number, updates: UpdatePayload) => void;
  onDelete: (id: number) => void;
  isUpdating: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  tags?: TagData[];
  allTags?: TagData[];
  onAddTag?: (actionItemId: number, tagId: number) => void;
  onRemoveTag?: (actionItemId: number, tagId: number) => void;
}

function EditableActionItem({ item, onUpdate, onDelete, isUpdating, dragHandleProps, tags = [], allTags = [], onAddTag, onRemoveTag }: EditableActionItemProps) {
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

  const [showCategoryMenu, setShowCategoryMenu] = useState(false);

  const handlePriorityChange = (priority: "low" | "medium" | "high") => {
    onUpdate(item.id, { priority });
    setShowPriorityMenu(false);
  };

  const handleCategoryChange = (category: CategoryType) => {
    onUpdate(item.id, { category });
    setShowCategoryMenu(false);
  };

  const handleDueDateChange = (date: Date | undefined) => {
    onUpdate(item.id, { dueDate: date ?? null });
  };

  const itemDueDate = item.dueDate ? new Date(item.dueDate) : undefined;
  const isOverdue = itemDueDate && !item.isCompleted && itemDueDate < new Date();

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
        {/* Drag Handle */}
        <div
          {...(dragHandleProps ?? {})}
          className="mt-1.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-4 w-4" />
        </div>

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

            {/* Category Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowCategoryMenu(!showCategoryMenu)}
                className="flex items-center gap-1"
                disabled={isUpdating}
              >
                <Badge
                  className={`${item.category ? (categoryColors[item.category] ?? categoryColors.General) : "bg-muted text-muted-foreground border-muted"} cursor-pointer hover:opacity-80`}
                  variant="outline"
                >
                  {item.category ?? "No category"}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Badge>
              </button>
              {showCategoryMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowCategoryMenu(false)}
                  />
                  <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg z-20 py-1 min-w-[140px]">
                    <button
                      onClick={() => handleCategoryChange(null)}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted text-muted-foreground"
                    >
                      No category
                    </button>
                    {CATEGORY_OPTIONS.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => handleCategoryChange(cat)}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Due Date Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 hover:bg-muted ${
                    isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"
                  }`}
                  disabled={isUpdating}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {itemDueDate ? format(itemDueDate, "MMM d, yyyy") : "Set due date"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={itemDueDate}
                  onSelect={handleDueDateChange}
                  initialFocus
                />
                {itemDueDate && (
                  <div className="border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-muted-foreground"
                      onClick={() => handleDueDateChange(undefined)}
                    >
                      Clear due date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Tags */}
            <div className="flex items-center gap-1 flex-wrap">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="text-xs gap-1 py-0"
                  style={{ borderColor: tag.color, color: tag.color }}
                >
                  {tag.name}
                  {onRemoveTag && (
                    <button
                      onClick={() => onRemoveTag(item.id, tag.id)}
                      className="ml-0.5 hover:opacity-70"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </Badge>
              ))}
              {onAddTag && allTags.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground rounded px-1 py-0.5 hover:bg-muted">
                      <Tag className="h-3 w-3" />
                      <span>+</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[200px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search tags..." />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup>
                          {allTags
                            .filter((t) => !tags.some((at) => at.id === t.id))
                            .map((tag) => (
                              <CommandItem
                                key={tag.id}
                                value={tag.name}
                                onSelect={() => onAddTag(item.id, tag.id)}
                                className="cursor-pointer"
                              >
                                <div
                                  className="h-3 w-3 rounded-full mr-2 shrink-0"
                                  style={{ backgroundColor: tag.color }}
                                />
                                <span className="truncate">{tag.name}</span>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
  const [showTagManager, setShowTagManager] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6b7280");

  const utils = api.useUtils();

  const { data, isLoading } = api.actionItems.getActionItems.useQuery({ botId });

  const { data: tagsData } = api.actionItems.getTags.useQuery();
  const allTags = tagsData?.tags ?? [];

  const actionItemIds = (data?.actionItems ?? []).map((i) => i.id);
  const { data: tagAssignmentsData } = api.actionItems.getTagsForItems.useQuery(
    { actionItemIds },
    { enabled: actionItemIds.length > 0 }
  );
  const tagAssignments = tagAssignmentsData?.assignments ?? {};

  const createTagMutation = api.actionItems.createTag.useMutation({
    onSuccess: () => {
      void utils.actionItems.getTags.invalidate();
      setNewTagName("");
      setNewTagColor("#6b7280");
    },
  });

  const deleteTagMutation = api.actionItems.deleteTag.useMutation({
    onSuccess: () => {
      void utils.actionItems.getTags.invalidate();
      void utils.actionItems.getTagsForItems.invalidate();
    },
  });

  const addTagMutation = api.actionItems.addTagToItem.useMutation({
    onSuccess: () => {
      void utils.actionItems.getTagsForItems.invalidate();
    },
  });

  const removeTagMutation = api.actionItems.removeTagFromItem.useMutation({
    onSuccess: () => {
      void utils.actionItems.getTagsForItems.invalidate();
    },
  });

  const handleAddTag = (actionItemId: number, tagId: number) => {
    addTagMutation.mutate({ actionItemId, tagId });
  };

  const handleRemoveTag = (actionItemId: number, tagId: number) => {
    removeTagMutation.mutate({ actionItemId, tagId });
  };

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

  const reorderMutation = api.actionItems.reorderActionItems.useMutation({
    onSuccess: () => {
      void utils.actionItems.getActionItems.invalidate({ botId });
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(data?.actionItems ?? []);
    const [reordered] = items.splice(result.source.index, 1);
    if (!reordered) return;
    items.splice(result.destination.index, 0, reordered);

    reorderMutation.mutate({
      botId,
      items: items.map((item, index) => ({ id: item.id, sortOrder: index })),
    });
  };

  const handleUpdate = (id: number, updates: UpdatePayload) => {
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
          <Button
            onClick={() => setShowTagManager(!showTagManager)}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Settings2 className="h-4 w-4" />
            Tags
          </Button>
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

      {/* Tag Manager Panel */}
      {showTagManager && (
        <div className="px-6 pb-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Manage Tags</span>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {allTags.map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="text-xs gap-1.5 py-0.5"
                style={{ borderColor: tag.color, color: tag.color }}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
                <button
                  onClick={() => {
                    if (confirm(`Delete tag "${tag.name}"? It will be removed from all action items.`)) {
                      deleteTagMutation.mutate({ id: tag.id });
                    }
                  }}
                  className="ml-0.5 hover:opacity-70"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {allTags.length === 0 && (
              <span className="text-xs text-muted-foreground">No tags created yet</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="New tag name..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              className="h-8 text-sm flex-1 max-w-[200px]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTagName.trim()) {
                  createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
                }
              }}
            />
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              className="h-8 w-8 rounded border cursor-pointer"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!newTagName.trim() || createTagMutation.isPending}
              onClick={() => {
                if (newTagName.trim()) {
                  createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
                }
              }}
            >
              Add Tag
            </Button>
          </div>
          {createTagMutation.error && (
            <p className="text-xs text-red-600 mt-1">{createTagMutation.error.message}</p>
          )}
        </div>
      )}

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
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="action-items">
              {(provided: DroppableProvided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-0"
                >
                  {actionItems.map((item, index) => (
                    <Draggable key={item.id} draggableId={String(item.id)} index={index}>
                      {(provided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={snapshot.isDragging ? "bg-muted/80 rounded-lg shadow-md" : ""}
                        >
                          <EditableActionItem
                            item={item}
                            onUpdate={handleUpdate}
                            onDelete={handleDelete}
                            isUpdating={updateMutation.isPending || deleteMutation.isPending}
                            dragHandleProps={provided.dragHandleProps}
                            tags={(tagAssignments[String(item.id)] ?? []) as TagData[]}
                            allTags={allTags as TagData[]}
                            onAddTag={handleAddTag}
                            onRemoveTag={handleRemoveTag}
                          />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
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
