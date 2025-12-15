import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

import { ModeToggle } from "@/components/ModeToggle";

export function SiteFooter({ className }: React.HTMLAttributes<HTMLElement>) {
  return (
    <footer className={cn(className)}>
      <div className="container flex flex-col items-center justify-between gap-4 py-6 md:h-16 md:flex-row md:py-0">
        <p className="text-center text-sm text-muted-foreground md:text-left">
          Powered by{" "}
          <Link
            href={siteConfig.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-4"
          >
            Tally Zero
          </Link>
        </p>
        <ModeToggle />
      </div>
    </footer>
  );
}
