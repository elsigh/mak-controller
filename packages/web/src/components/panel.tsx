import type { ComponentProps } from "react";
import { Card } from "@/components/ui/card";
import { panelCardClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function Panel({ className, ...props }: ComponentProps<typeof Card>) {
  return <Card className={cn(panelCardClass, className)} {...props} />;
}
