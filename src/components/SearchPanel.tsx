import { formatDiaryBadge } from "../lib/date";
import { HighlightText } from "./HighlightText";
import type { SearchResult } from "../state/types";

interface SearchPanelProps {
  query: string;
  results: SearchResult[];
  searching: boolean;
  onQueryChange: (query: string) => void;
  onSelectDate: (entryDate: string) => void;
}

export function SearchPanel({
  query,
  results,
  searching,
  onQueryChange,
  onSelectDate,
}: SearchPanelProps) {
  return (
    <section className="search-panel">
      <label className="field field--compact">
        <span>搜索历史</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索标题或摘要"
        />
      </label>

      <div className="search-results">
        {query.trim() ? (
          <>
            {searching ? <p className="muted-copy">正在翻找旧页...</p> : null}
            {!searching && results.length === 0 ? (
              <p className="muted-copy">还没有找到匹配的日记。</p>
            ) : null}
            {results.map((result) => (
              <button
                key={result.id}
                className="search-result"
                onClick={() => onSelectDate(result.entryDate)}
                type="button"
              >
                <strong>
                  <HighlightText
                    text={result.title}
                    query={query}
                    fallback="未命名日记"
                  />
                </strong>
                <span>
                  <HighlightText
                    text={result.excerpt}
                    query={query}
                    fallback="这一天还没有摘要。"
                  />
                </span>
                <small>{formatDiaryBadge(result.entryDate)}</small>
              </button>
            ))}
          </>
        ) : (
          <p className="muted-copy">可按标题和摘要快速跳到过去的某一天。</p>
        )}
      </div>
    </section>
  );
}
