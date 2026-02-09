"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";
import { 
  Users, 
  Plus, 
  Search,
  Upload,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";

interface AttendeeFormData {
  name: string;
  email: string;
  role: string;
  department: string;
}

const emptyFormData: AttendeeFormData = {
  name: "",
  email: "",
  role: "",
  department: "",
};

export default function AttendeesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<AttendeeFormData>(emptyFormData);
  const [editFormData, setEditFormData] = useState<AttendeeFormData>(emptyFormData);
  const [csvData, setCsvData] = useState("");

  const utils = api.useUtils();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/attendees");
    }
  }, [status, router]);

  // Check if user has GC role
  const isGC = session?.user?.role === "gc";

  useEffect(() => {
    if (status === "authenticated" && !isGC) {
      router.push("/");
    }
  }, [status, isGC, router]);

  const { 
    data: attendeesData, 
    isLoading,
    error,
  } = api.attendees.getAll.useQuery(
    { search: searchTerm || undefined },
    { enabled: !!session && isGC }
  );

  const createMutation = api.attendees.create.useMutation({
    onSuccess: () => {
      void utils.attendees.getAll.invalidate();
      setShowAddDialog(false);
      setFormData(emptyFormData);
    },
  });

  const updateMutation = api.attendees.update.useMutation({
    onSuccess: () => {
      void utils.attendees.getAll.invalidate();
      setEditingId(null);
    },
  });

  const deleteMutation = api.attendees.delete.useMutation({
    onSuccess: () => {
      void utils.attendees.getAll.invalidate();
    },
  });

  const bulkCreateMutation = api.attendees.bulkCreate.useMutation({
    onSuccess: (data) => {
      void utils.attendees.getAll.invalidate();
      setShowUploadDialog(false);
      setCsvData("");
      alert(`Created ${data.created} attendees. ${data.failed} failed.`);
    },
  });

  const handleCreate = () => {
    if (!formData.name.trim()) return;
    createMutation.mutate({
      name: formData.name.trim(),
      email: formData.email.trim() || undefined,
      role: formData.role.trim() || undefined,
      department: formData.department.trim() || undefined,
    });
  };

  const handleUpdate = (id: number) => {
    if (!editFormData.name.trim()) return;
    updateMutation.mutate({
      id,
      name: editFormData.name.trim(),
      email: editFormData.email.trim() || null,
      role: editFormData.role.trim() || null,
      department: editFormData.department.trim() || null,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this attendee?")) {
      deleteMutation.mutate({ id });
    }
  };

  const startEditing = (attendee: { id: number; name: string; email: string | null; role: string | null; department: string | null }) => {
    setEditingId(attendee.id);
    setEditFormData({
      name: attendee.name,
      email: attendee.email ?? "",
      role: attendee.role ?? "",
      department: attendee.department ?? "",
    });
  };

  const handleCsvUpload = () => {
    const lines = csvData.trim().split("\n");
    const attendees: AttendeeFormData[] = [];

    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      if (parts[0]) {
        attendees.push({
          name: parts[0],
          email: parts[1] ?? "",
          role: parts[2] ?? "",
          department: parts[3] ?? "",
        });
      }
    }

    if (attendees.length > 0) {
      bulkCreateMutation.mutate({ attendees });
    }
  };

  const attendees = attendeesData?.attendees ?? [];

  if (status === "loading") {
    return (
      <div className="space-y-6 py-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!session || !isGC) {
    return null;
  }

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            Attendees
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your master list of meeting attendees
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Attendees from CSV</DialogTitle>
                <DialogDescription>
                  Paste CSV data with format: Name, Email, Role, Department (one per line)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <textarea
                  className="w-full h-48 p-3 border rounded-md font-mono text-sm"
                  placeholder="John Doe, john@example.com, Manager, Engineering&#10;Jane Smith, jane@example.com, Director, Product"
                  value={csvData}
                  onChange={(e) => setCsvData(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCsvUpload}
                  disabled={bulkCreateMutation.isPending || !csvData.trim()}
                >
                  {bulkCreateMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Attendee
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Attendee</DialogTitle>
                <DialogDescription>
                  Add a new attendee to the master list
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="Manager"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="Engineering"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !formData.name.trim()}
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search attendees..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {attendees.length} attendee{attendees.length !== 1 ? "s" : ""}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md bg-red-50 p-4 text-red-600">
              Failed to load attendees: {error.message}
            </div>
          ) : attendees.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No attendees found</p>
              <p className="text-sm mt-1">Add attendees to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendees.map((attendee) => (
                  <TableRow key={attendee.id}>
                    {editingId === attendee.id ? (
                      <>
                        <TableCell>
                          <Input
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editFormData.email}
                            onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editFormData.role}
                            onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={editFormData.department}
                            onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => handleUpdate(attendee.id)}
                              disabled={updateMutation.isPending}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="font-medium">{attendee.name}</TableCell>
                        <TableCell>{attendee.email ?? "-"}</TableCell>
                        <TableCell>{attendee.role ?? "-"}</TableCell>
                        <TableCell>{attendee.department ?? "-"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => startEditing(attendee)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-600 hover:text-red-700"
                              onClick={() => handleDelete(attendee.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
