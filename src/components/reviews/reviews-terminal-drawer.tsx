"use client";

import { ReviewsTerminalPanel } from "~/components/reviews/reviews-terminal-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";

type ReviewsTerminalDrawerProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ReviewsTerminalDrawer({
  isOpen,
  onOpenChange,
}: ReviewsTerminalDrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-lg">
        <SheetHeader className="sr-only">
          <SheetTitle>Review Terminal</SheetTitle>
          <SheetDescription>
            Local terminal panel scoped to the reviews dashboard.
          </SheetDescription>
        </SheetHeader>
        <ReviewsTerminalPanel onCollapse={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
