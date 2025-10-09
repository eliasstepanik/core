import { EllipsisVertical, Trash, Copy } from "lucide-react";
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
import { useState, useEffect } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";
import { toast } from "~/hooks/use-toast";

interface LogOptionsProps {
  id: string;
}

export const LogOptions = ({ id }: LogOptionsProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deleteFetcher = useFetcher<{ success: boolean }>();
  const navigate = useNavigate();

  const handleDelete = () => {
    deleteFetcher.submit(
      { id },
      {
        method: "DELETE",
        action: "/api/v1/ingestion_queue/delete",
        encType: "application/json",
      },
    );
    setDeleteDialogOpen(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      toast({
        title: "Copied",
        description: "Episode ID copied to clipboard",
      });
    } catch (err) {
      console.error("Failed to copy:", err);
      toast({
        title: "Error",
        description: "Failed to copy ID",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (deleteFetcher.state === "idle" && deleteFetcher.data?.success) {
      navigate(`/home/inbox`);
    }
  }, [deleteFetcher.state, deleteFetcher.data]);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="gap-2 rounded"
          onClick={handleCopy}
        >
          <Copy size={15} /> Copy ID
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="gap-2 rounded"
          onClick={(e) => {
            setDeleteDialogOpen(true);
          }}
        >
          <Trash size={15} /> Delete
        </Button>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Episode</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this episode? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
