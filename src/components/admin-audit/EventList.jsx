import { EmptyState, TableShell, Td, Th } from "@/components/common";
import { describeEvent, EVENT_LABEL } from "@/lib/auditEvents";
import { formatDateTime } from "@/lib/time";

const Who = ({ actor }) => (
  <>
    <span className="font-medium text-ink">{actor?.name || "—"}</span>
    {actor?.role && actor.role !== "system" && <span className="text-ink-3"> ({actor.role})</span>}
  </>
);

/** The event log as a table from 860 px up; below that, one stacked cell per event. */
export const EventList = ({ events, names, compact = false }) =>
  events.length === 0 ? (
    <EmptyState compact title="No events match" body="Try widening the filters or the dates." />
  ) : (
    <TableShell>
      <thead>
        <tr className="border-b border-rule-2">
          <Th>What</Th>
          <Th className="max-tablet:hidden">Who</Th>
          <Th className="max-tablet:hidden">Details</Th>
          <Th className="max-tablet:hidden">When</Th>
          {!compact && <Th className="text-right max-tablet:hidden">#</Th>}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => {
          const detail = describeEvent(e, names);
          return (
            <tr key={e.seq} className="border-b border-rule align-top last:border-b-0">
              <Td className="text-[13.5px] font-medium text-ink">
                {EVENT_LABEL(e.type)}
                <div className="mt-1 space-y-0.5 text-[12px] font-normal tablet:hidden">
                  {detail && <div className="text-ink-2">{detail}</div>}
                  <div className="text-ink-3">
                    <Who actor={e.actor} /> · {formatDateTime(e.at)} · #{e.seq}
                  </div>
                </div>
              </Td>
              <Td className="text-[13px] max-tablet:hidden">
                <Who actor={e.actor} />
              </Td>
              <Td className="max-w-[460px] text-[13px] text-ink-2 max-tablet:hidden">{detail}</Td>
              <Td className="whitespace-nowrap font-mono text-[12px] text-ink-3 max-tablet:hidden">{formatDateTime(e.at)}</Td>
              {!compact && <Td className="text-right font-mono text-[12px] tabular-nums text-ink-3 max-tablet:hidden">{e.seq}</Td>}
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
