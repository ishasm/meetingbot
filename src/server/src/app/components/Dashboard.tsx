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
    <>
      <div className="mt-5 mb-5">
        <h1 className="text-3xl font-bold">
          Welcome to Meeting Bot
          {session?.user?.name ? `, ${session.user.name}` : ""}
        </h1>
        <p className="mt-2 text-gray-600">
          Easily create automated applications that leverage recordings across
          popular video meeting platforms.
        </p>
      </div>
      <div>
        {/* GC Role Dashboard */}
        {isGC && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4 text-emerald-700">Governance Council</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              <DashboardCard
                title="Calendar"
                className="h-full min-h-48 border-emerald-200 hover:border-emerald-400 transition-colors"
                description="View and manage meeting calendar"
                content={
                  <div className="text-sm text-muted-foreground">
                    Schedule and track meetings
                  </div>
                }
                icon={<Calendar className="text-emerald-600" />}
                link={{
                  type: "INTERNAL",
                  url: "/calendar",
                  text: "Open Calendar",
                }}
              />
              <DashboardCard
                title="Attendees"
                className="h-full min-h-48 border-emerald-200 hover:border-emerald-400 transition-colors"
                description="Master attendee list"
                content={
                  attendeesCountLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-3xl font-bold text-emerald-600">
                      {attendeesCount}
                    </div>
                  )
                }
                icon={<Users className="text-emerald-600" />}
                link={{
                  type: "INTERNAL",
                  url: "/attendees",
                  text: "Manage Attendees",
                }}
              />
              <DashboardCard
                title="Action Items"
                className="h-full min-h-48 border-emerald-200 hover:border-emerald-400 transition-colors"
                description="Track all action items"
                content={
                  actionItemsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div>
                      <div className="text-3xl font-bold text-emerald-600">
                        {openActionItems}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        open items
                      </div>
                    </div>
                  )
                }
                icon={<CheckSquare className="text-emerald-600" />}
                link={{
                  type: "INTERNAL",
                  url: "/action-items",
                  text: "View All",
                }}
              />
              <DashboardCard
                title="Agenda Items"
                className="h-full min-h-48 border-emerald-200 hover:border-emerald-400 transition-colors"
                description="Track all agenda items"
                content={
                  agendaItemsLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div>
                      <div className="text-3xl font-bold text-emerald-600">
                        {openAgendaItems}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        open items
                      </div>
                    </div>
                  )
                }
                icon={<ListTodo className="text-emerald-600" />}
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DashboardCard
              title="Active Bots"
              className="h-full min-h-56"
              content={
                activeBotCountLoading ? (
                  <Skeleton className="h-10 w-10" />
                ) : activeBotCountError ? (
                  <div className="text-4xl font-bold">
                    <ErrorAlert errorMessage={activeBotCountError.message} />
                  </div>
                ) : (
                  <div className="text-4xl font-bold">
                    {activeBotCount?.count}
                  </div>
                )
              }
              icon={<Bot />}
              link={{
                type: "INTERNAL",
                url: "/bots",
                text: "View Bots",
              }}
            />
            <DashboardCard
              title="Active Keys"
              className="h-full min-h-56"
              content={
                keyCountLoading ? (
                  <Skeleton className="h-10 w-10" />
                ) : keyCountError ? (
                  <div className="text-4xl font-bold">
                    <ErrorAlert errorMessage={keyCountError.message} />
                  </div>
                ) : (
                  <div className="text-4xl font-bold">{keyCount?.count}</div>
                )
              }
              icon={<Key />}
              link={{
                type: "INTERNAL",
                url: "/keys",
                text: "View Keys",
              }}
            />
            <div className="h-[30rem] lg:col-span-2 lg:min-h-0">
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
        )}

        {/* Regular user dashboard (non-admin, non-gc) */}
        {!isAdmin && !isGC && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DashboardCard
              title="Active Bots"
              className="h-full min-h-56"
              content={
                activeBotCountLoading ? (
                  <Skeleton className="h-10 w-10" />
                ) : activeBotCountError ? (
                  <div className="text-4xl font-bold">
                    <ErrorAlert errorMessage={activeBotCountError.message} />
                  </div>
                ) : (
                  <div className="text-4xl font-bold">
                    {activeBotCount?.count}
                  </div>
                )
              }
              icon={<Bot />}
              link={{
                type: "INTERNAL",
                url: "/meetings",
                text: "View Meetings",
              }}
            />
            <div className="h-[30rem] lg:col-span-1 lg:min-h-0">
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
        )}
      </div>
    </>
  );
}
