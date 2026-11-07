import { Action, ActionPanel, Grid, Icon, LocalStorage, showToast, Toast } from "@raycast/api";
import { useEffect, useRef, useState, type JSX } from "react";
import { cellImage, type BoardSlot } from "./cell-image";
import { book, hAspire } from "./data";
import { EditMine } from "./edit-mine";
import { incrementPractices, loadMine } from "./mine";
import { gradeAnswer, ROWS, showForms, speechLines, TENSES } from "./model";
import { playSpeech } from "./speech";
import { expected, firstSlot, gridRows, pageForVerb, pageOf, pageSize, slotId, slotsForVerb, type Layout, type Mode, type Slot } from "./practice-mine-model";

export default function PracticeMineCommand() {
  const [verbs, setVerbs] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  function reload() {
    void loadMine().then((names) => {
      setError(false);
      setVerbs([...new Set(names)]);
    }).catch(() => setError(true));
  }

  useEffect(() => { reload(); }, []);

  if (error) {
    return <Grid><Grid.EmptyView title="无法读取我的动词" actions={<ActionPanel><Action title="重试" onAction={reload} /></ActionPanel>} /></Grid>;
  }
  if (verbs === null) return <Grid isLoading />;
  if (!verbs.length) {
    return (
      <Grid>
        <Grid.EmptyView
          title="我的动词列表为空"
          description="请先添加要练习的动词。"
          actions={<ActionPanel><Action.Push title="编辑我的动词" icon={Icon.Pencil} target={<EditMine onSaved={reload} />} /></ActionPanel>}
        />
      </Grid>
    );
  }
  return <MinePractice verbs={verbs} />;
}

function MinePractice({ verbs }: { verbs: string[] }) {
  const [mode, setMode] = useState<Mode>(0);
  const [layout, setLayout] = useState<Layout>("tenses");
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Store the answer that was checked, so changing one cell only clears that cell's result.
  const [checked, setChecked] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [cursor, setCursor] = useState<Slot>(() => firstSlot(pageOf(verbs, 0, "tenses"), 0));
  const [searchText, setSearchText] = useState("");
  const answersRef = useRef(answers);
  const cursorRef = useRef(cursor);
  const echo = useRef<string | null>(null);
  const lock = useRef(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutChanged = useRef(false);
  const pageCount = Math.ceil(verbs.length / pageSize(layout));
  const pageVerbs = pageOf(verbs, page, layout);
  const rowCount = mode === "parts" ? 2 : ROWS.length;
  const modeName = mode === "parts" ? "分词" : TENSES[mode].zh;

  useEffect(() => {
    let active = true;
    void LocalStorage.getItem<string>("practice-mine-layout").then((saved) => {
      if (active && !layoutChanged.current && (saved === "persons" || saved === "tenses")) {
        brieflyLockSelection();
        setPage(pageForVerb(verbs, cursorRef.current.verb, saved));
        setLayout(saved);
      }
    }).catch(() => {
      if (active) void showToast({ style: Toast.Style.Failure, title: "读取布局设置失败，使用默认布局" });
    });
    return () => { active = false; if (lockTimer.current) clearTimeout(lockTimer.current); };
  }, []);

  function toggleLayout() {
    layoutChanged.current = true;
    const next = layout === "tenses" ? "persons" : "tenses";
    // Keep the selected verb and its input visible after changing page size.
    setPage(pageForVerb(verbs, cursorRef.current.verb, next));
    brieflyLockSelection();
    setLayout(next);
    void LocalStorage.setItem("practice-mine-layout", next).catch(() => {
      void showToast({ style: Toast.Style.Failure, title: "布局设置保存失败" });
    });
  }

  function brieflyLockSelection() {
    lock.current = true;
    if (lockTimer.current) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => { lock.current = false; }, 120);
  }

  function select(slot: Slot) {
    const value = answersRef.current[slotId(slot)] ?? "";
    cursorRef.current = slot;
    echo.current = value;
    brieflyLockSelection();
    setCursor(slot);
    setSearchText(value);
  }

  function onSelectionChange(id: string | null) {
    if (!id || lock.current) return;
    // Only accept IDs belonging to the currently displayed page and mode.
    const slot = pageVerbs.flatMap((verb) => slotsForVerb(verb, mode)).find((item) => slotId(item) === id);
    if (slot && id !== slotId(cursorRef.current)) select(slot);
  }

  function onSearch(value: string) {
    if (echo.current !== null && value === echo.current) {
      echo.current = null;
      return;
    }
    echo.current = null;
    const slot = cursorRef.current;
    if (!expected(slot)) return;
    brieflyLockSelection();
    const id = slotId(slot);
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setAnswers(next);
    setSearchText(value);
    setChecked((current) => {
      if (!(id in current)) return current;
      const updated = { ...current };
      delete updated[id];
      return updated;
    });
  }

  function changeMode(next: Mode) {
    setMode(next);
    select(firstSlot(pageVerbs, next));
  }

  function changePage(next: number) {
    if (next < 0 || next >= pageCount) return;
    setPage(next);
    select(firstSlot(pageOf(verbs, next, layout), mode));
  }

  function moveNext() {
    // Walk each verb's persons in order, skipping unavailable conjugations.
    const slots = pageVerbs.flatMap((verb) => slotsForVerb(verb, mode)).filter((slot) => expected(slot));
    if (!slots.length) return;
    const index = slots.findIndex((slot) => slotId(slot) === slotId(cursorRef.current));
    select(slots[(index + 1) % slots.length]);
  }

  async function check() {
    const slots = pageVerbs.flatMap((verb) => slotsForVerb(verb, mode));
    const filled = slots.filter((slot) => expected(slot) && (answersRef.current[slotId(slot)] ?? "").trim());
    if (!filled.length) {
      await showToast({ style: Toast.Style.Failure, title: "先填几格再检查", message: "空着的不记分" });
      return;
    }
    let ok = 0;
    let bad = 0;
    const newChecked = { ...checked };
    for (const slot of filled) {
      const id = slotId(slot);
      const answer = answersRef.current[id];
      newChecked[id] = answer;
      if (gradeAnswer(expected(slot), answer) === "ok") ok++;
      else bad++;
    }
    setChecked(newChecked);
    try {
      await incrementPractices(filled.map((slot) => slot.verb));
      await showToast({ style: bad ? Toast.Style.Failure : Toast.Style.Success, title: `已填 ${filled.length}，正确 ${ok}，错误 ${bad}`, message: bad ? "红字为正确拼写" : "填写的格子都正确" });
    } catch {
      await showToast({ style: Toast.Style.Failure, title: `已检查：正确 ${ok}，错误 ${bad}`, message: "练习次数保存失败" });
    }
  }

  function clearPage() {
    const ids = new Set(pageVerbs.flatMap((verb) => slotsForVerb(verb, mode)).map(slotId));
    const remaining = Object.fromEntries(Object.entries(answersRef.current).filter(([id]) => !ids.has(id)));
    answersRef.current = remaining;
    setAnswers(remaining);
    setChecked((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))));
    select(cursorRef.current);
  }

  function speakCurrent() {
    const verb = cursorRef.current.verb;
    const line = speechLines(verb, book.verbs[verb], hAspire.has(verb)).find((item) => item.id === (mode === "parts" ? "part" : `t${mode}`));
    if (!line) {
      void showToast({ style: Toast.Style.Failure, title: `${verb} 没有${modeName}的朗读内容` });
      return;
    }
    void playSpeech(line.speech, `${verb} · ${modeName}`);
  }

  function actions(): JSX.Element {
    return (
      <ActionPanel>
        <Action title="下一格" icon={Icon.ArrowDown} onAction={moveNext} />
        <Action title="检查当前页" icon={Icon.Check} shortcut={{ modifiers: ["cmd"], key: "return" }} onAction={check} />
        <Action title={`朗读 ${cursor.verb} · ${modeName}`} icon={Icon.Speaker} shortcut={{ modifiers: ["cmd", "shift"], key: "s" }} onAction={speakCurrent} />
        <Action title={showAll ? "隐藏全部答案" : "显示全部答案"} icon={showAll ? Icon.EyeDisabled : Icon.Eye} shortcut={{ modifiers: ["cmd", "shift"], key: "h" }} onAction={() => setShowAll((current) => !current)} />
        <Action title={layout === "tenses" ? "切换为人称做列" : "切换为动词做列"} icon={Icon.AppWindowGrid2x2} onAction={toggleLayout} />
        <Action title="清空当前页" icon={Icon.Trash} shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }} onAction={clearPage} />
        {page > 0 && <Action title="上一页" icon={Icon.ArrowLeft} shortcut={{ modifiers: ["cmd", "shift"], key: "[" }} onAction={() => changePage(page - 1)} />}
        {page + 1 < pageCount && <Action title="下一页" icon={Icon.ArrowRight} shortcut={{ modifiers: ["cmd", "shift"], key: "]" }} onAction={() => changePage(page + 1)} />}
        <ActionPanel.Section title="选择练习内容">
          <Action title="分词" shortcut={{ modifiers: ["cmd"], key: "0" }} onAction={() => changeMode("parts")} />
          {TENSES.map((tense, index) => (
            <Action key={tense.fr} title={tense.zh} shortcut={{ modifiers: ["cmd"], key: String(index + 1) as "1" | "2" | "3" | "4" | "5" | "6" }} onAction={() => changeMode(index as Mode)} />
          ))}
        </ActionPanel.Section>
      </ActionPanel>
    );
  }

  function renderItem(slot: Slot) {
    const id = slotId(slot);
    const forms = expected(slot);
    const raw = (answers[id] ?? "").replace(/\s+/g, " ").trim();
    const grade = checked[id] === answers[id] ? gradeAnswer(forms, raw) : "empty";
    const label = `${slot.verb} ${mode === "parts" ? (slot.row === 0 ? "过去分词" : "现在分词") : ROWS[slot.row].label}`;
    let main = raw || "____";
    let correct: string | undefined;
    let style: BoardSlot["style"] = "plain";
    if (!forms) {
      main = "";
      style = "na";
    } else if (showAll) {
      main = showForms(forms);
      style = id === slotId(cursor) ? "selected" : "header";
    } else if (grade === "bad") {
      correct = showForms(forms);
      style = "bad";
    } else if (grade === "ok") {
      style = "ok";
    } else if (id === slotId(cursor)) {
      style = "selected";
    }
    return <Grid.Item key={id} id={id} content={cellImage(main, label, style, correct)} actions={actions()} />;
  }

  const rows = gridRows(pageVerbs, mode, layout);
  const columns = layout === "tenses" ? pageVerbs.length : rowCount;
  const cursorLabel = mode === "parts" ? (cursor.row === 0 ? "过去分词" : "现在分词") : ROWS[cursor.row].label;

  return (
    <Grid
      navigationTitle={`我的动词 · ${modeName} · ${page + 1}/${pageCount}`}
      columns={columns}
      aspectRatio="16/9"
      inset={Grid.Inset.Zero}
      fit={Grid.Fit.Fill}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={onSearch}
      onSelectionChange={onSelectionChange}
      selectedItemId={slotId(cursor)}
      searchBarPlaceholder={`${cursor.verb} · ${cursorLabel} · 回车下一格 · ⌘↩ 检查`}
    >
      {rows.map((row, index) => <Grid.Section key={index} columns={columns} aspectRatio="16/9" inset={Grid.Inset.Zero} fit={Grid.Fit.Fill}>{row.map(renderItem)}</Grid.Section>)}
    </Grid>
  );
}
