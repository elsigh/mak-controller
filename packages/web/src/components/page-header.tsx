import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  truncate = false,
}: {
  title: string;
  description?: string;
  truncate?: boolean;
}) {
  return (
    <div className="min-h-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className={cn("mt-1 min-h-5 text-sm text-muted-foreground", truncate && "truncate")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
