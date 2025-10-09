import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDocumentDialog({
  open,
  onOpenChange,
}: AddDocumentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>
        {/* TODO: Add document content here */}
        <div className="border-border rounded-md border p-4">
          <p className="text-muted-foreground text-sm">
            Document upload content goes here...
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
