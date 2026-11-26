// ── A WhatsApp message shown the way WhatsApp shows it ──
// WhatsApp turns *text* into bold and _text_ into italics. The preview does the same, so a teacher
// never wonders why there are asterisks in the message (the text sent is unchanged).
const TOKEN = /(\*[^*\n]+\*|_[^_\n]+_)/g;

const renderLine = (line, key) =>
  line.split(TOKEN).map((part, i) => {
    if (/^\*[^*\n]+\*$/.test(part)) return <strong key={`${key}-${i}`} className="font-semibold">{part.slice(1, -1)}</strong>;
    if (/^_[^_\n]+_$/.test(part)) return <em key={`${key}-${i}`}>{part.slice(1, -1)}</em>;
    return part;
  });

export const WhatsAppText = ({ text = "", className }) => (
  <div dir="auto" className={className}>
    {text.split("\n").map((line, i) => (
      <div key={i} className="min-h-[1lh]">
        {renderLine(line, i)}
      </div>
    ))}
  </div>
);
