import { formatDiaryBadge, todayEntryDate } from "../lib/date";

interface DateRailProps {
  dates: string[];
  selectedDate: string;
  onSelect: (entryDate: string) => void;
}

export function DateRail({ dates, selectedDate, onSelect }: DateRailProps) {
  const today = todayEntryDate();

  return (
    <nav className="date-rail" aria-label="最近日期">
      {dates.map((entryDate) => {
        const isActive = entryDate === selectedDate;
        const isToday = entryDate === today;

        return (
          <button
            key={entryDate}
            className={`date-pill${isActive ? " is-active" : ""}`}
            onClick={() => onSelect(entryDate)}
            type="button"
          >
            <span>{formatDiaryBadge(entryDate)}</span>
            <small>{isToday ? "今天" : entryDate.slice(5)}</small>
          </button>
        );
      })}
    </nav>
  );
}
