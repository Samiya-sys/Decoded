import { cn } from "@/lib/utils";

export function RiskBadge({ risk, className }: { risk: string; className?: string }) {
  const label = risk === "high" ? "High impact" : risk === "medium" ? "Worth knowing" : "Routine";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase",
        risk === "high" && "border-risk-high/40 bg-risk-high/10 text-risk-high",
        risk === "medium" && "border-risk-medium/40 bg-risk-medium/10 text-risk-medium",
        risk !== "high" && risk !== "medium" && "border-risk-low/40 bg-risk-low/10 text-risk-low",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
