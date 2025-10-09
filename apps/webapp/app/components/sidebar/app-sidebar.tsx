import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "../ui/sidebar";
import {
  Columns3,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  MessageSquare,
  Network,
  Plus,
} from "lucide-react";
import { NavMain } from "./nav-main";
import { useUser } from "~/hooks/useUser";
import { NavUser } from "./nav-user";
import Logo from "../logo/logo";
import { ConversationList } from "../conversation";
import { Button } from "../ui";
import { Project } from "../icons/project";
import { AddMemoryCommand } from "../command-bar/add-memory-command";
import { AddMemoryDialog } from "../command-bar/memory-dialog.client";

const data = {
  navMain: [
    {
      title: "Inbox",
      url: "/home/inbox",
      icon: Inbox,
    },
    {
      title: "Chat",
      url: "/home/conversation",
      icon: MessageSquare,
    },
    {
      title: "Memory",
      url: "/home/dashboard",
      icon: Network,
    },
    {
      title: "Spaces",
      url: "/home/space",
      icon: Project,
    },
    {
      title: "Integrations",
      url: "/home/integrations",
      icon: LayoutGrid,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const user = useUser();

  const [showAddMemory, setShowAddMemory] = React.useState(false);

  // Open command bar with Meta+K (Cmd+K on Mac, Ctrl+K on Windows/Linux)
  useHotkeys("meta+k", (e) => {
    e.preventDefault();
    setShowAddMemory(true);
  });

  return (
    <>
      <Sidebar
        variant="inset"
        {...props}
        className="bg-background h-[100vh] py-2"
      >
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem className="flex justify-center">
              <div className="mt-1 ml-1 flex w-full items-center justify-start gap-2">
                <Logo size={20} />
                C.O.R.E.
              </div>

              <Button
                variant="secondary"
                isActive
                size="sm"
                className="rounded"
                onClick={() => setShowAddMemory(true)}
              >
                <Plus size={16} />
              </Button>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <NavMain items={data.navMain} />
          <div className="mt-4 flex h-full flex-col">
            <h2 className="text-muted-foreground px-4 text-sm"> History </h2>
            <ConversationList />
          </div>
        </SidebarContent>

        <SidebarFooter className="flex flex-col px-2">
          <NavUser user={user} />
        </SidebarFooter>
      </Sidebar>

      {showAddMemory && (
        <AddMemoryDialog open={showAddMemory} onOpenChange={setShowAddMemory} />
      )}
    </>
  );
}
