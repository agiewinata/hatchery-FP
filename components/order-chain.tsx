import { flowFor, STATUS_LABELS, isTerminal } from "@/lib/orders/transitions";
import { cn } from "@/lib/utils";

import type { FulfilmentType, OrderItemStatus } from "@/lib/generated/prisma/enums";

/**
 * The order progress tracker, drawn as a chain.
 *
 * A keychain is a chain, so the metaphor is literal rather than applied: links
 * already closed are behind you, the link being closed is where the order is
 * now, and the open links ahead are still to come. It encodes both sequence
 * and position, which a row of dots does not.
 *
 * Only the steps belonging to THIS item's fulfilment path are shown - a
 * print-on-demand charm goes through production, a seller-stocked item does
 * not, and showing a buyer stages that will never happen is misleading.
 */
export function OrderChain({
  status,
  fulfilmentType,
}: {
  status: OrderItemStatus;
  fulfilmentType: FulfilmentType;
}) {
  // Cancelled and refunded orders left the flow; a progress chain would imply
  // they are still moving.
  if (status === "CANCELLED" || status === "REFUNDED") {
    return (
      <p className="text-sm font-medium text-destructive">
        {STATUS_LABELS[status]}
      </p>
    );
  }

  const steps = flowFor(fulfilmentType);
  const currentIndex = steps.indexOf(status);
  const complete = isTerminal(status);

  return (
    <ol className="flex flex-wrap items-start gap-x-1 gap-y-4" aria-label="Order progress">
      {steps.map((step, index) => {
        const done = index < currentIndex || (complete && index <= currentIndex);
        const current = index === currentIndex && !complete;

        return (
          <li key={step} className="flex items-start">
            <div className="flex w-18 flex-col items-center gap-1.5 text-center">
              {/* The link itself: filled when closed, outlined when still open. */}
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full border-2 transition-colors",
                  done && "border-ink bg-ink",
                  current && "border-enamel bg-enamel/15",
                  !done && !current && "border-border bg-transparent",
                )}
                aria-hidden="true"
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    done && "bg-paper",
                    current && "bg-enamel",
                    !done && !current && "bg-transparent",
                  )}
                />
              </span>

              <span
                className={cn(
                  "text-[11px] leading-tight",
                  current ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {STATUS_LABELS[step]}
              </span>
            </div>

            {/* The length of chain joining this link to the next. */}
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "mt-2.5 h-0.5 w-4 rounded-full sm:w-8",
                  index < currentIndex ? "bg-ink" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The full event history for one item.
 *
 * Read from the append-only OrderItemEvent table, so this is a genuine audit
 * trail rather than a guess reconstructed from the current status.
 */
export function OrderHistory({
  events,
}: {
  events: { status: OrderItemStatus; note: string | null; createdAt: Date }[];
}) {
  if (events.length === 0) return null;

  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {[...events].reverse().map((event, index) => (
        <li key={`${event.status}-${event.createdAt.toISOString()}`} className="relative text-sm">
          <span
            aria-hidden="true"
            className={cn(
              "absolute -left-[21px] top-1.5 size-2 rounded-full",
              index === 0 ? "bg-enamel" : "bg-border",
            )}
          />
          <p className={cn("font-medium", index === 0 && "text-foreground")}>
            {STATUS_LABELS[event.status]}
          </p>
          {event.note && <p className="text-muted-foreground">{event.note}</p>}
          <time
            dateTime={event.createdAt.toISOString()}
            className="text-xs text-muted-foreground"
          >
            {event.createdAt.toLocaleString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </li>
      ))}
    </ol>
  );
}
