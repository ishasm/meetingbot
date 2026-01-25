"use client";
import DashboardCard from "./DashboardCard";
import { Plus, LogIn } from "lucide-react";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function WelcomeDashboard() {
  const { data: session } = useSession();
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
        <DashboardCard
          title="Get Started"
          description={
            session?.user
              ? "To start creating bots, create your first API Key!"
              : "To get started, log-in or sign-up!"
          }
          content={
            session?.user ? (
              <Link href="/keys">
                <Button>
                  Create API Key <Plus />
                </Button>
              </Link>
            ) : (
              <Link href={`/api/auth/signin?provider=github`}>
                <Button>
                  Sign In <LogIn />
                </Button>
              </Link>
            )
          }
        />
      </div>
    </>
  );
}
