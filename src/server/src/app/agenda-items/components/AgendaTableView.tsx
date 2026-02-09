"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  Columns3,
  MessageSquare,
  Gavel,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { type AgendaViewProps, type AgendaItem, statusColors } from "./types";

export function AgendaTableView({ items, onItemClick }: AgendaViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns: ColumnDef<AgendaItem>[] = [
    {
      accessorKey: "serialNum",
      header: "#",
      cell: ({ row }) => (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
          {row.getValue("serialNum")}
        </div>
      ),
      size: 60,
    },
    {
      accessorKey: "description",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Description
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original;
        const hasDiscussion = item.discussionSummary;
        const hasDecision = item.decisionResolution;
        
        return (
          <div className="flex items-center gap-2">
            <span className={cn(
              "line-clamp-2",
              item.status === "Closed" && "line-through text-muted-foreground"
            )}>
              {row.getValue("description")}
            </span>
            {(hasDiscussion ?? hasDecision) && (
              <div className="flex items-center gap-1 shrink-0">
                {hasDiscussion && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
                      </TooltipTrigger>
                      <TooltipContent>Has discussion summary</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {hasDecision && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Gavel className="h-3.5 w-3.5 text-green-600" />
                      </TooltipTrigger>
                      <TooltipContent>Has decision/resolution</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Status
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = row.getValue<string | null>("status") ?? "Open";
        return (
          <Badge variant="outline" className={cn(statusColors[status])}>
            {status}
          </Badge>
        );
      },
      size: 100,
    },
    {
      accessorKey: "ownerNames",
      header: "Owner",
      cell: ({ row }) => {
        const item = row.original;
        if (item.ownerNames && item.ownerNames.length > 0) {
          return (
            <span className="text-sm truncate max-w-[150px] block">
              {item.ownerNames.map((o) => o.name).join(", ")}
            </span>
          );
        }
        if (item.ownerName) {
          return <span className="text-sm">{item.ownerName}</span>;
        }
        return <span className="text-muted-foreground text-sm">-</span>;
      },
      size: 150,
    },
    {
      accessorKey: "meetingTitle",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Meeting
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div className="text-sm">
            <div className="font-medium truncate max-w-[200px]">
              {item.meetingTitle ?? "-"}
            </div>
            {item.meetingDate != null && (
              <div className="text-muted-foreground text-xs">
                {format(new Date(item.meetingDate), "MMM d, yyyy")}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "dateAdded",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="-ml-4"
        >
          Added
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.getValue<Date | null>("dateAdded");
        return date ? (
          <span className="text-sm text-muted-foreground">
            {format(new Date(date), "MMM d")}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
      size: 100,
    },
    {
      accessorKey: "duration",
      header: "Duration",
      cell: ({ row }) => {
        const duration = row.getValue<string | null>("duration");
        return duration ? (
          <span className="text-sm">{duration}</span>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        );
      },
      size: 100,
    },
  ];

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Column visibility toggle */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id === "serialNum" ? "#" : column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} style={{ width: header.getSize() }}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onItemClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          {table.getFilteredRowModel().rows.length} item(s) total
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <div className="text-sm text-muted-foreground">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
