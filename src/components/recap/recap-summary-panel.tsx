import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

type RecapSummaryPanelProps = {
  completion: string;
  isGenerating: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
};

export function RecapSummaryPanel({
  completion,
  isGenerating,
  onChange,
  onCopy,
}: RecapSummaryPanelProps) {
  if (!completion && !isGenerating) {
    return null;
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          AI Summary
        </h3>
        {completion && !isGenerating ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-6 gap-1 px-2 text-[11px]"
            onClick={onCopy}
          >
            <HugeiconsIcon icon={Copy01Icon} size={12} />
            Copy
          </Button>
        ) : null}
      </div>
      <Textarea
        value={completion}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[200px] font-mono text-xs"
        placeholder="Generating summary..."
      />
    </div>
  );
}
