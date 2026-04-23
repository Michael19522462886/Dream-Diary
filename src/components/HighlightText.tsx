function escapeRegExp(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface HighlightTextProps {
  text: string;
  query: string;
  fallback?: string;
}

export function HighlightText({
  text,
  query,
  fallback = "",
}: HighlightTextProps) {
  const content = text || fallback;
  const needle = query.trim();

  if (!needle) {
    return <>{content}</>;
  }

  const matcher = new RegExp(`(${escapeRegExp(needle)})`, "gi");
  const parts = content.split(matcher);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === needle.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="search-highlight">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}
