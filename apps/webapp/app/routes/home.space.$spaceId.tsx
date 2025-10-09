import { PageHeader } from "~/components/common/page-header";
import { type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { requireUserId } from "~/services/session.server";
import { ClientOnly } from "remix-utils/client-only";
import { SpaceService } from "~/services/space.server";
import { useTypedLoaderData } from "remix-typedjson";
import { Outlet, useLocation, useNavigate } from "@remix-run/react";
import { SpaceOptions } from "~/components/spaces/space-options";
import { LoaderCircle } from "lucide-react";
import { Button } from "~/components/ui";
import React from "react";
import { AddMemoryDialog } from "~/components/command-bar/memory-dialog.client";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  const spaceService = new SpaceService();

  const spaceId = params.spaceId; // Get spaceId from URL params
  const space = await spaceService.getSpace(spaceId as string, userId);

  return space;
}

export default function Space() {
  const space = useTypedLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const [showAddMemory, setShowAddMemory] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Space"
        breadcrumbs={[
          { label: "Spaces", href: "/home/space" },
          {
            label: (
              <div className="flex items-center gap-2">
                <span>{space?.name || "Untitled"}</span>
              </div>
            ),
          },
        ]}
        tabs={[
          {
            label: "Overview",
            value: "overview",
            isActive: location.pathname.includes("/overview"),
            onClick: () => navigate(`/home/space/${space.id}/overview`),
          },
          {
            label: "Episodes",
            value: "edpisodes",
            isActive: location.pathname.includes("/episodes"),
            onClick: () => navigate(`/home/space/${space.id}/episodes`),
          },
        ]}
        actionsNode={
          <ClientOnly
            fallback={
              <div>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              </div>
            }
          >
            {() => (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowAddMemory(true)}
                >
                  Add episode
                </Button>
                <SpaceOptions
                  id={space.id as string}
                  name={space.name}
                  description={space.description}
                />
              </div>
            )}
          </ClientOnly>
        }
      />
      <div className="relative flex h-[calc(100vh_-_56px)] w-full flex-col items-center justify-start overflow-auto">
        <Outlet />

        {showAddMemory && (
          <AddMemoryDialog
            open={showAddMemory}
            onOpenChange={setShowAddMemory}
            defaultSpaceId={space.id}
          />
        )}
      </div>
    </>
  );
}
