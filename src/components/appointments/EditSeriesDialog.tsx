import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type SeriesEditChoice = "this" | "future" | "all" | null;

interface Props {
  open: boolean;
  onChoice: (choice: SeriesEditChoice) => void;
  mode: "edit" | "delete";
}

export function EditSeriesDialog({ open, onChoice, mode }: Props) {
  const isDelete = mode === "delete";
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onChoice(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isDelete ? "Delete Recurring Appointment" : "Edit Recurring Appointment"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            This appointment is part of a recurring series. How would you like to proceed?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 py-2">
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => onChoice("this")}
          >
            {isDelete ? "Delete only this occurrence" : "Edit only this occurrence"}
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => onChoice("future")}
          >
            {isDelete ? "Delete this and all future occurrences" : "Edit all future occurrences"}
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => onChoice("all")}
          >
            {isDelete ? "Delete the entire series" : "Edit the entire series"}
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
