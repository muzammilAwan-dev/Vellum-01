import { policyBlocks } from "@/lib/privacy";

/** A policy as readable text. Plain text in, React elements out: nothing is ever inserted as HTML. */
export const PolicyDocument = ({ text }) => (
  <div className="text-[14.5px] leading-[1.7] text-ink-2" dir="auto">
    {policyBlocks(text).map((b, i) =>
      b.type === "h" ? (
        <h2 key={i} className="mb-2 mt-7 font-serif text-[19px] font-semibold leading-snug text-ink first:mt-0">{b.text}</h2>
      ) : b.type === "ul" ? (
        <ul key={i} className="mb-3 list-disc space-y-1 ps-5 marker:text-ink-3">
          {b.items.map((li, j) => <li key={j}>{li}</li>)}
        </ul>
      ) : (
        <p key={i} className="mb-3">{b.text}</p>
      ),
    )}
  </div>
);
