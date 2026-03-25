import { Topbar } from "~/components/dashboard/topbar";
import { ReviewsWorkspace } from "~/components/reviews/reviews-workspace";

export default function ReviewsPage() {
  return (
    <div className="flex h-full overflow-hidden flex-col">
      <Topbar title="Reviews" />
      <ReviewsWorkspace />
    </div>
  );
}
