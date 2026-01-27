import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";

interface DashboardCardProps {
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  content?: string | React.ReactNode;
  icon?: React.ReactNode;
  link?:
    | {
        type: "EXTERNAL" | "INTERNAL";
        url: string;
        text: string;
      }
    | {
        type: "CUSTOM";
        component: React.ReactNode;
      };
  className?: string;
}

export default function DashboardCard({
  title,
  description,
  content,
  icon,
  link,
  className,
}: DashboardCardProps) {
  return (
    <Card className={`flex h-full flex-col overflow-hidden ${className}`}>
      {(!!title || !!description || !!icon) && (
        <CardHeader className="relative pb-2">
          {!!icon && (
            <div className="absolute top-4 right-4 p-2 rounded-xl bg-muted/50">
              {icon}
            </div>
          )}
          {!!title && typeof title === "string" ? (
            <CardTitle className="text-lg">{title}</CardTitle>
          ) : (
            title
          )}
          {!!description &&
            (typeof description === "string" ? (
              <CardDescription className="text-sm">{description}</CardDescription>
            ) : (
              description
            ))}
        </CardHeader>
      )}

      {!!content && (
        <CardContent className="min-h-0 flex-1 pt-2">{content}</CardContent>
      )}
      {!!link && (
        <CardFooter className="mt-auto pt-4 border-t bg-muted/30">
          {link.type == "CUSTOM" ? (
            link.component
          ) : (
            <Link 
              href={link.url} 
              className="flex items-center text-sm font-medium text-primary hover:text-primary/80 transition-colors group"
            >
              {link.text}
              {link.type === "EXTERNAL" ? (
                <ExternalLink className="ml-2 h-4 w-4" />
              ) : (
                <ChevronRight className="ml-1 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              )}
            </Link>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
