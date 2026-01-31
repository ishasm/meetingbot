"use client";

import DashboardCard from "./DashboardCard";
import { Bot, Key, Calendar, Users, CheckSquare, ListTodo } from "lucide-react";
import { UsageChart } from "../usage/components/UsageChart";
import { api } from "~/trpc/react";
import { Skeleton } from "~/components/ui/skeleton";
import ErrorAlert from "~/components/custom/ErrorAlert";
import { useSession } from "next-auth/react";

export default function Dashboard() {
  const { data: session } = useSession();

  // Check if user is GC role
  const isGC = session?.user?.role === "gc";
  const isAdmin = session?.user?.role === "admin";

  const {
    data: activeBotCount,
    isLoading: activeBotCountLoading,
    error: activeBotCountError,
  } = api.bots.getActiveBotCount.useQuery({});

  const {
    data: keyCount,
    isLoading: keyCountLoading,
    error: keyCountError,
  } = api.apiKeys.getApiKeyCount.useQuery({});

  // GC-specific queries
  const {
    data: attendeesData,
    isLoading: attendeesCountLoading,
  } = api.attendees.getAll.useQuery(undefined, {
    enabled: isGC,
  });

  const {
    data: actionItemsData,
    isLoading: actionItemsLoading,
  } = api.actionItems.getAllActionItems.useQuery({ includeCompleted: true }, {
    enabled: isGC,
  });

  const {
    data: agendaItemsData,
    isLoading: agendaItemsLoading,
  } = api.agendaItems.getAll.useQuery(undefined, {
    enabled: isGC,
  });

  // Count open/pending items
  const attendeesCount = attendeesData?.attendees?.length ?? 0;
  const openActionItems = actionItemsData?.actionItems?.filter(item => !item.isCompleted)?.length ?? 0;
  const openAgendaItems = agendaItemsData?.agendaItems?.filter(item => item.status === "Open")?.length ?? 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s an overview of your workspace
        </p>
      </div>

      {/* GC Role Dashboard */}
      {isGC && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-emerald-500" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Group Coordinator</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardCard
              title="Calendar"
              className="h-full"
              description="View and manage meeting calendar"
              content={
                <div className="text-sm text-muted-foreground">
                  Schedule and track meetings
                </div>
              }
              icon={<Calendar className="h-4 w-4 text-emerald-600" />}
              link={{
                type: "INTERNAL",
                url: "/calendar",
                text: "Open Calendar",
              }}
            />
            {/* <DashboardCard
              title="Attendees"
              className="h-full"
              description="Master attendee list"
              content={
                attendeesCountLoading ? (
                  <Skeleton className="h-8 w-12 rounded" />
                ) : (
                  <div className="text-3xl font-semibold text-foreground">
                    {attendeesCount}
                  </div>
                )
              }
              icon={<Users className="h-4 w-4 text-emerald-600" />}
              link={{
                type: "INTERNAL",
                url: "/attendees",
                text: "Manage Attendees",
              }}
            /> */}
            <DashboardCard
              title="Action Items"
              className="h-full"
              description="Track all action items"
              content={
                actionItemsLoading ? (
                  <Skeleton className="h-8 w-12 rounded" />
                ) : (
                  <div>
                    <div className="text-3xl font-semibold text-foreground">
                      {openActionItems}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      open items
                    </div>
                  </div>
                )
              }
              icon={<CheckSquare className="h-4 w-4 text-emerald-600" />}
              link={{
                type: "INTERNAL",
                url: "/action-items",
                text: "View All",
              }}
            />
            <DashboardCard
              title="Agenda Items"
              className="h-full"
              description="Track all agenda items"
              content={
                agendaItemsLoading ? (
                  <Skeleton className="h-8 w-12 rounded" />
                ) : (
                  <div>
                    <div className="text-3xl font-semibold text-foreground">
                      {openAgendaItems}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      open items
                    </div>
                  </div>
                )
              }
              icon={<ListTodo className="h-4 w-4 text-emerald-600" />}
              link={{
                type: "INTERNAL",
                url: "/agenda-items",
                text: "View All",
              }}
            />
          </div>
        </div>
      )}

      {/* Admin Dashboard */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-primary" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Overview</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardCard
              title="Active Bots"
              className="h-full min-h-40"
              content={
                activeBotCountLoading ? (
                  <Skeleton className="h-10 w-14 rounded" />
                ) : activeBotCountError ? (
                  <ErrorAlert errorMessage={activeBotCountError.message} />
                ) : (
                  <div className="text-4xl font-semibold text-foreground">
                    {activeBotCount?.count}
                  </div>
                )
              }
              icon={<Bot className="h-4 w-4 text-primary" />}
              link={{
                type: "INTERNAL",
                url: "/bots",
                text: "View Bots",
              }}
            />
            <DashboardCard
              title="Active Keys"
              className="h-full min-h-40"
              content={
                keyCountLoading ? (
                  <Skeleton className="h-10 w-14 rounded" />
                ) : keyCountError ? (
                  <ErrorAlert errorMessage={keyCountError.message} />
                ) : (
                  <div className="text-4xl font-semibold text-foreground">
                    {keyCount?.count}
                  </div>
                )
              }
              icon={<Key className="h-4 w-4 text-primary" />}
              link={{
                type: "INTERNAL",
                url: "/keys",
                text: "View Keys",
              }}
            />
            <div className="h-80 lg:col-span-2">
              <DashboardCard
                title="Recent Usage"
                className="h-full"
                content={<UsageChart />}
                link={{
                  type: "INTERNAL",
                  url: "/usage",
                  text: "View Usage",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Regular user dashboard (non-admin, non-gc) */}
      {!isAdmin && !isGC && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-1 rounded-full bg-primary" />
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Overview</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardCard
              title="Active Bots"
              className="h-full min-h-40"
              content={
                activeBotCountLoading ? (
                  <Skeleton className="h-10 w-14 rounded" />
                ) : activeBotCountError ? (
                  <ErrorAlert errorMessage={activeBotCountError.message} />
                ) : (
                  <div className="text-4xl font-semibold text-foreground">
                    {activeBotCount?.count}
                  </div>
                )
              }
              icon={<Bot className="h-4 w-4 text-primary" />}
              link={{
                type: "INTERNAL",
                url: "/meetings",
                text: "View Meetings",
              }}
            />
            <div className="h-80">
              <DashboardCard
                title="Recent Usage"
                className="h-full"
                content={<UsageChart />}
                link={{
                  type: "INTERNAL",
                  url: "/usage",
                  text: "View Usage",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
