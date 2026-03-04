// Shared types for agenda items views
// This extends the base AgendaItem interface from AgendaItemDetailModal
// with additional fields needed for the views

export interface AgendaItem {
  id: number;
  botId: number;
  serialNum: number;
  description: string;
  duration: string | null;
  dateAdded: Date | null;
  status: string | null;
  remarks: string | null;
  discussionSummary: string | null;
  decisionResolution: string | null;
  ownerAttendeeId: number | null;
  ownerAttendeeIds?: number[] | null;
  sadhguruComments: string | null;
  attachments: string[] | null;
  category?: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  ownerName?: string | null;
  ownerNames?: { id: number; name: string }[];
  meetingTitle?: string;
  meetingDate?: Date;
}

export interface AgendaViewProps {
  items: AgendaItem[];
  onItemClick: (item: AgendaItem) => void;
  onStatusChange?: (itemId: number, newStatus: string) => void;
}

export const statusColors: Record<string, string> = {
  Open: "bg-blue-100 text-blue-800 border-blue-200",
  Closed: "bg-green-100 text-green-800 border-green-200",
};
