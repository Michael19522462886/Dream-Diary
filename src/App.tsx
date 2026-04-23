import { Suspense, lazy } from "react";
import { DateRail } from "./components/DateRail";
import { SearchPanel } from "./components/SearchPanel";
import { UnlockScreen } from "./components/UnlockScreen";
import { useJournalApp } from "./hooks/useJournalApp";
import { getMoodLabel, getWeatherLabel, MOOD_OPTIONS, WEATHER_OPTIONS } from "./lib/journalMeta";

const BookScene = lazy(async () => {
  const module = await import("./components/BookScene");
  return { default: module.BookScene };
});

const DiaryEditor = lazy(async () => {
  const module = await import("./components/DiaryEditor");
  return { default: module.DiaryEditor };
});

function SaveLabel({ saveState }: { saveState: "idle" | "saving" | "saved" | "error" }) {
  const label =
    saveState === "saving"
      ? "自动保存中"
      : saveState === "saved"
        ? "已保存"
        : saveState === "error"
          ? "保存失败"
          : "等待输入";

  return <span className={`status-pill status-pill--${saveState}`}>{label}</span>;
}

export default function App() {
  const {
    authMode,
    previewMode,
    selectedDate,
    entry,
    entryHeading,
    recentDates,
    saveState,
    isTurning,
    turnDirection,
    loadingEntry,
    searchQuery,
    searchResults,
    searching,
    errorMessage,
    pageMotionKey,
    restorableDraft,
    lastEditedLabel,
    canEdit,
    onAuthSubmit,
    onOpenDate,
    onOpenPreviousDay,
    onOpenNextDay,
    onOpenToday,
    onUpdateTitle,
    onUpdateMood,
    onUpdateWeather,
    onUpdateContent,
    onRestoreDraft,
    onDismissDraft,
    onSearchQueryChange,
  } = useJournalApp();

  return (
    <div className="app-shell">
      <Suspense fallback={<div className="scene-layer scene-layer--fallback" aria-hidden="true" />}>
        <BookScene motionKey={pageMotionKey} />
      </Suspense>

      <div className="app-overlay">
        <header className="topbar">
          <div>
            <p className="topbar__eyebrow">Windows Desktop Diary</p>
            <h1>梦境日记本</h1>
          </div>

          <div className="topbar__meta">
            {previewMode ? <span className="status-pill status-pill--idle">浏览器预览模式</span> : null}
            {authMode === "ready" ? <SaveLabel saveState={saveState} /> : null}
          </div>
        </header>

        {authMode === "checking" ? (
          <section className="loading-card">
            <p>正在整理书页与灯光...</p>
          </section>
        ) : authMode === "setup" || authMode === "locked" ? (
          <UnlockScreen
            mode={authMode}
            errorMessage={errorMessage}
            onSubmit={onAuthSubmit}
          />
        ) : (
          <main className="workspace">
            <DateRail
              dates={recentDates}
              selectedDate={selectedDate}
              onSelect={onOpenDate}
            />

            <section
              className={`book-panel${isTurning ? ` is-turning is-${turnDirection}` : ""}`}
            >
              <div className="book-spine" />

              <section className="page page--left">
                <p className="page__eyebrow">Entry Date</p>
                <h2>{entryHeading}</h2>

                <div className="meta-grid">
                  <div className="meta-card">
                    <span>心情</span>
                    <strong>{getMoodLabel(entry?.mood ?? "")}</strong>
                    <div className="choice-grid">
                      {MOOD_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          className={`choice-pill${entry?.mood === option.value ? " is-active" : ""}`}
                          onClick={() => onUpdateMood(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="meta-card">
                    <span>天气</span>
                    <strong>{getWeatherLabel(entry?.weather ?? "")}</strong>
                    <div className="choice-grid">
                      {WEATHER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          className={`choice-pill${entry?.weather === option.value ? " is-active" : ""}`}
                          onClick={() => onUpdateWeather(option.value)}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="meta-card meta-card--recovery">
                    <span>最近编辑恢复</span>
                    <strong>{restorableDraft ? "发现未恢复草稿" : "已同步到本地"}</strong>
                    <p className="muted-copy">
                      {restorableDraft
                        ? `检测到 ${lastEditedLabel} 的本地草稿，可直接恢复到当前页。`
                        : `最近一次稳定保存时间：${lastEditedLabel || "还没有内容"}`}
                    </p>
                    {restorableDraft ? (
                      <div className="nav-cluster">
                        <button className="primary-button" onClick={onRestoreDraft} type="button">
                          恢复最近草稿
                        </button>
                        <button className="ghost-button" onClick={() => void onDismissDraft()} type="button">
                          丢弃草稿
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <label className="field">
                  <span>标题</span>
                  <input
                    type="text"
                    value={entry?.title ?? ""}
                    onChange={(event) => onUpdateTitle(event.target.value)}
                    placeholder="给今天写一个标题"
                  />
                </label>

                <div className="nav-cluster">
                  <button className="ghost-button" onClick={onOpenPreviousDay} type="button">
                    前一天
                  </button>
                  <button className="primary-button" onClick={onOpenToday} type="button">
                    回到今天
                  </button>
                  <button className="ghost-button" onClick={onOpenNextDay} type="button">
                    后一天
                  </button>
                </div>

                <SearchPanel
                  query={searchQuery}
                  results={searchResults}
                  searching={searching}
                  onQueryChange={onSearchQueryChange}
                  onSelectDate={onOpenDate}
                />
              </section>

              <section className="page page--right">
                <div className="page__header">
                  <div>
                    <p className="page__eyebrow">Writing Surface</p>
                    <h3>{entry?.title?.trim() || "今天的正文"}</h3>
                  </div>
                  <p className="page__hint">
                    {loadingEntry ? "翻页中..." : "字体使用内置笔写资源，编辑层保持桌面端可用性。"}
                  </p>
                </div>

                <div className="editor-wrap">
                  {entry ? (
                    <Suspense fallback={<p className="muted-copy">正在展开书写纸页...</p>}>
                      <DiaryEditor
                        disabled={!canEdit}
                        value={entry.contentJson}
                        onChange={onUpdateContent}
                      />
                    </Suspense>
                  ) : null}
                </div>

                {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
              </section>
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
