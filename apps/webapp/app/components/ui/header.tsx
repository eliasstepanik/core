import { RiGithubFill } from "@remixicon/react";
import { Button } from "./button";
import { Separator } from "./separator";
import { useLocation } from "@remix-run/react";

const PAGE_TITLES: Record<string, string> = {
  "/home/dashboard": "Memory graph",
  "/home/chat": "Chat",
  "/home/api": "API",
  "/home/logs": "Logs",
};

function getHeaderTitle(pathname: string): string {
  // Try to match the most specific path first
  for (const key of Object.keys(PAGE_TITLES)) {
    if (pathname.startsWith(key)) {
      return PAGE_TITLES[key];
    }
  }
  // Default fallback
  return "Documents";
}

export function SiteHeader() {
  const location = useLocation();
  const title = getHeaderTitle(location.pathname);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2">
        <h1 className="text-base">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" className="hidden sm:flex">
            <a
              href="https://github.com/redplanethq/core"
              rel="noopener noreferrer"
              target="_blank"
              className="dark:text-foreground"
            >
              <RiGithubFill size={20} />
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
