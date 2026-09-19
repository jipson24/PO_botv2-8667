import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Карточка-панель терминала. */
export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "relative z-10 rounded-xl border border-border/80 bg-card/80 backdrop-blur-sm",
        className,
      )}
    >
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "call" | "put" | "gold" | "info";
}) {
  const toneClass = {
    default: "text-foreground",
    call: "text-call",
    put: "text-put",
    gold: "text-gold",
    info: "text-info",
  }[tone];
  return (
    <div className="relative z-10 rounded-xl border border-border/80 bg-card/80 px-4 py-3 backdrop-blur-sm">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("num mt-1.5 text-2xl font-bold leading-none", toneClass)}>{value}</div>
      {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Chip({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "call" | "put" | "gold" | "info";
  className?: string;
}) {
  const tones = {
    muted: "border-border bg-elevated text-muted-foreground",
    call: "border-call/40 bg-call/10 text-call",
    put: "border-put/40 bg-put/10 text-put",
    gold: "border-gold/40 bg-gold/10 text-gold",
    info: "border-info/40 bg-info/10 text-info",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-elevated", className)} />;
}

export function Empty({ icon, text }: { icon?: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      {icon && <div className="text-muted-foreground/60">{icon}</div>}
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** Полоса уверенности 0–100. */
export function ConfidenceBar({ value, tone }: { value: number; tone: "call" | "put" }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
      <div
        className={cn("h-full rounded-full", tone === "call" ? "bg-call" : "bg-put")}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
