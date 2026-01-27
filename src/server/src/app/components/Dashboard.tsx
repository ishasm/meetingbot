"use client";

import DashboardCard from "./DashboardCard";
import { Bot, Key, Calendar, Users, CheckSquare, ListTodo, Sparkles } from "lucide-react";
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
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8 md:p-10">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">Dashboard</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Welcome back
            {session?.user?.name ? `, ${session.user.name}` : ""}
          </h1>
          <p className="mt-3 text-muted-foreground max-w-2xl">
            Easily create automated applications that leverage recordings across
            popular video meeting platforms.
          </p>
        </div>
        {/* Decorative elements */}
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      </div>

      {/* GC Role Dashboard */}
      {isGC && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600" />
            <h2 className="text-xl font-semibold">Governance Council</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardCard
              title="Calendar"
              className="h-full min-h-44 group hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300"
              description="View and manage meeting calendar"
              content={
                <div className="text-sm text-muted-foreground">
                  Schedule and track meetings
                </div>
              }
              icon={<Calendar className="text-emerald-500 group-hover:scale-110 transition-transform" />}
              link={{
                type: "INTERNAL",
                url: "/calendar",
                text: "Open Calendar",
              }}
            />
            <DashboardCard
              title="Attendees"
              className="h-full min-h-44 group hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300"
              description="Master attendee list"
              content={
                attendeesCountLoading ? (
                  <Skeleton className="h-10 w-16 rounded-lg" />
                ) : (
                  <div className="text-4xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                    {attendeesCount}
                  </div>
                )
              }
              icon={<Users className="text-emerald-500 group-hover:scale-110 transition-transform" />}
              link={{
                type: "INTERNAL",
                url: "/attendees",
                text: "Manage Attendees",
              }}
            />
            <DashboardCard
              title="Action Items"
              className="h-full min-h-44 group hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300"
              description="Track all action items"
              content={
                actionItemsLoading ? (
                  <Skeleton className="h-10 w-16 rounded-lg" />
                ) : (
                  <div>
                    <div className="text-4xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                      {openActionItems}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      open items
                    </div>
                  </div>
                )
              }
              icon={<CheckSquare className="text-emerald-500 group-hover:scale-110 transition-transform" />}
              link={{
                type: "INTERNAL",
                url: "/action-items",
                text: "View All",
              }}
            />
            <DashboardCard
              title="Agenda Items"
              className="h-full min-h-44 group hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300"
              description="Track all agenda items"
              content={
                agendaItemsLoading ? (
                  <Skeleton className="h-10 w-16 rounded-lg" />
                ) : (
                  <div>
                    <div className="text-4xl font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent">
                      {openAgendaItems}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      open items
                    </div>
                  </div>
                )
              }
              icon={<ListTodo className="text-emerald-500 group-hover:scale-110 transition-transform" />}
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
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-gradient-to-b from-primary to-primary/70" />
            <h2 className="text-xl font-semibold">Admin Overview</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardCard
              title="Active Bots"
              className="h-full min-h-52 group hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
              content={
                activeBotCountLoading ? (
                  <Skeleton className="h-12 w-16 rounded-lg" />
                ) : activeBotCountError ? (
                  <ErrorAlert errorMessage={activeBotCountError.message} />
                ) : (
                  <div className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {activeBotCount?.count}
                  </div>
                )
              }
              icon={<Bot className="text-primary group-hover:scale-110 transition-transform" />}
              link={{
                type: "INTERNAL",
                url: "/bots",
                text: "View Bots",
              }}
            />
            <DashboardCard
              title="Active Keys"
              className="h-full min-h-52 group hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
              content={
                keyCountLoading ? (
                  <Skeleton className="h-12 w-16 rounded-lg" />
                ) : keyCountError ? (
                  <ErrorAlert errorMessage={keyCountError.message} />
                ) : (
                  <div className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {keyCount?.count}
                  </div>
                )
              }
              icon={<Key className="text-primary group-hover:scale-110 transition-transform" />}
              link={{
                type: "INTERNAL",
                url: "/keys",
                text: "View Keys",
              }}
            />
            <div className="h-[28rem] lg:col-span-2">
              <DashboardCard
                title="Your Recent Usage"
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
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 rounded-full bg-gradient-to-b from-primary to-primary/70" />
            <h2 className="text-xl font-semibold">Your Overview</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardCard
              title="Active Bots"
              className="h-full min-h-52 group hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
              content={
                activeBotCountLoading ? (
                  <Skeleton className="h-12 w-16 rounded-lg" />
                ) : activeBotCountError ? (
                  <ErrorAlert errorMessage={activeBotCountError.message} />
                ) : (
                  <div className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {activeBotCount?.count}
                  </div>
                )
              }
              icon={<Bot className="text-primary group-hover:scale-110 transition-transform" />}
              link={{
                type: "INTERNAL",
                url: "/meetings",
                text: "View Meetings",
              }}
            />
            <div className="h-[28rem]">
              <DashboardCard
                title="Your Recent Usage"
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
