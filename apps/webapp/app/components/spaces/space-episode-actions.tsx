import { EllipsisVertical, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import { toast } from "~/hooks/use-toast";

interface SpaceEpisodeActionsProps {
  episodeId: string;
  spaceId: string;
}

export const SpaceEpisodeActions = ({
  episodeId,
  spaceId,
}: SpaceEpisodeActionsProps) => {
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const removeFetcher = useFetcher();
  const navigate = useNavigate();

  const handleRemove = () => {
    removeFetcher.submit(
      {
        episodeIds: JSON.stringify([episodeId]),
        spaceId,
        action: "remove",
      },
      {
        method: "post",
        action: "/api/v1/episodes/assign-space",
        encType: "application/json",
      },
    );
    setRemoveDialogOpen(false);
  };

  useEffect(() => {
    if (removeFetcher.state === "idle" && removeFetcher.data) {
      if (removeFetcher.data.success) {
        toast({
          title: "Success",
          description: "Episode removed from space",
        });
        // Reload the page to refresh the episode list
        navigate(".", { replace: true });
      } else {
        toast({
          title: "Error",
          description: removeFetcher.data.error || "Failed to remove episode",
          variant: "destructive",
        });
      }
    }
  }, [removeFetcher.state, removeFetcher.data, navigate]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-6 w-6 shrink-0 items-center justify-center p-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <EllipsisVertical size={16} />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => setRemoveDialogOpen(true)}>
            <Button variant="link" size="sm" className="gap-2 rounded">
              <Trash size={15} /> Remove from space
            </Button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from space</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this episode from the space? This
              will not delete the episode itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
