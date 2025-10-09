import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { AddMemoryDialog } from "./memory-dialog.client";
import { AddDocumentDialog } from "./document-dialog";

interface AddMemoryCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddMemoryCommand({
  open,
  onOpenChange,
}: AddMemoryCommandProps) {
  const [showAddMemory, setShowAddMemory] = useState(false);
  const [showAddDocument, setShowAddDocument] = useState(false);

  const handleAddMemory = () => {
    onOpenChange(false);
    setShowAddMemory(true);
  };

  const handleAddDocument = () => {
    onOpenChange(false);
    setShowAddDocument(true);
  };

  return (
    <>
      {/* Main Command Dialog */}
      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput placeholder="Search" className="py-1" />
        <CommandList>
          <CommandGroup heading="Add to Memory">
            <CommandItem
              onSelect={handleAddMemory}
              className="flex items-center gap-2 py-1"
            >
              <Plus className="mr-2 h-4 w-4" />
              <span>Add Memory</span>
            </CommandItem>
            <CommandItem
              onSelect={handleAddDocument}
              className="flex items-center gap-2 py-1"
            >
              <FileText className="mr-2 h-4 w-4" />
              <span>Add Document</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {showAddMemory && (
        <AddMemoryDialog open={showAddMemory} onOpenChange={setShowAddMemory} />
      )}

      {/* Add Document Dialog */}
      <AddDocumentDialog
        open={showAddDocument}
        onOpenChange={setShowAddDocument}
      />
    </>
  );
}
