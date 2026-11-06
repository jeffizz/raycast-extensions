import { Action, ActionPanel, Grid, Icon, LocalStorage, showToast, Toast, type LaunchProps } from "@raycast/api";
import { useEffect, useRef, useState, type JSX } from "react";
import { cellImage, type BoardSlot, type CellStyle } from "./cell-image";
import { book, hAspire, randomVerb } from "./data";
import { EditMine } from "./edit-mine";
import {
  expectedOf,
  gradeAnswer,
  ROWS,
  showForms,
  slotLabel,
  speechLines,
  TENSES,
  type SpeechLine,
  type VerbForms,
} from "./model";
import { addMine, incrementPractice, loadMine, randomOf, removeMine } from "./mine";
import { OpenVerb } from "./open-verb";
import { playSpeech } from "./speech";

const TENSE_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

export default function PracticeCommand(props: LaunchProps) {
  return (
    <OpenVerb
      fallbackText={props.fallbackText}
      render={({ infinitive, pick }) => <PracticeGrid key={infinitive} infinitive={infinitive} onPick={pick} />}
    />
  );
}

const LAYOUT_KEY = "practice-layout";

function PracticeGrid({ infinitive, onPick }: { infinitive: string; onPick: (infinitive: string) => void }) {
  const forms = book.verbs[infinitive];
  const start = "c0-0";
  const [cursor, setCursor] = useState(start);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<"tenses" | "parts">("tenses");
  const [layout, setLayout] = useState<"persons" | "tenses">("tenses");

  // 加载保存的布局
  useEffect(() => {
    void LocalStorage.getItem<string>(LAYOUT_KEY).then((saved) => {
      if (saved === "persons" || saved === "tenses") {
        setLayout(saved);
      }
    });
  }, []);

  // 保存布局变化
  const setLayoutPersistent = (newLayout: "persons" | "tenses") => {
    setLayout(newLayout);
    void LocalStorage.setItem(LAYOUT_KEY, newLayout);
  };
  const cursorRef = useRef(cursor);
  const answersRef = useRef(answers);
  const echo = useRef<string | null>(null);
  const lock = useRef(false);
  cursorRef.current = cursor;
  answersRef.current = answers;

  if (!forms) return <Grid><Grid.EmptyView title="没有这个动词" /></Grid>;

  function remember(id: string, value: string) {
    const next = { ...answersRef.current, [id]: value };
    answersRef.current = next;
    setAnswers(next);
  }

  function select(id: string) {
    const value = answersRef.current[id] ?? "";
    echo.current = value;
    cursorRef.current = id;
    lock.current = true;
    setCursor(id);
    setSearchText(value);
    setTimeout(() => {
      lock.current = false;
    }, 120);
  }

  function onSelectionChange(id: string | null) {
    if (!id) return;
    if (lock.current) {
      if (id !== cursorRef.current) setCursor(cursorRef.current);
      return;
    }
    if (id !== cursorRef.current) select(id);
  }

  function onSearch(value: string) {
    if (echo.current !== null && value === echo.current) {
      echo.current = null;
      return;
    }
    echo.current = null;
    const id = cursorRef.current;
    if (!editable(forms!, id)) return;
    lock.current = true;
    setSearchText(value);
    remember(id, value);
    setChecked(false);
    setTimeout(() => {
      lock.current = false;
    }, 120);
  }

  function moveNext() {
    const id = cursorRef.current;
    if (id === "pp") {
      select(forms!.prp.length ? "prp" : "pp");
      return;
    }
    if (id === "prp") {
      select(forms!.pp.length ? "pp" : "prp");
      return;
    }
    const match = /^c(\d)-(\d)$/.exec(id);
    if (!match) return;
    const person = Number(match[1]);
    const tense = Number(match[2]);
    if (person + 1 < ROWS.length) {
      select(`c${person + 1}-${tense}`);
      return;
    }
    const nextTense = tense + 1;
    if (nextTense < TENSES.length) {
      select(`c0-${nextTense}`);
      return;
    }
    select("c0-0");
  }

  function check() {
    const ids = editableIds(forms!);
    const filled = ids.filter((id) => (answersRef.current[id] ?? "").trim());
    if (!filled.length) {
      showToast({ style: Toast.Style.Failure, title: "先填几格再检查", message: "空着的不记分" });
      setChecked(false);
      return;
    }
    setChecked(true);
    let ok = 0;
    let bad = 0;
    for (const id of filled) {
      const grade = gradeAnswer(expectedOf(forms!, id), answersRef.current[id] ?? "");
      if (grade === "ok") ok++;
      else if (grade === "bad") bad++;
    }
    // 练习次数统计（无论对错都算一次练习）
    void incrementPractice(infinitive);
    showToast({
      style: bad ? Toast.Style.Failure : Toast.Style.Success,
      title: `已填 ${filled.length}，正确 ${ok}，错误 ${bad}`,
      message: bad ? "错的格子下面，红色是正确拼写" : "这一格都对",
    });
  }

  function reset() {
    answersRef.current = {};
    setAnswers({});
    setChecked(false);
    select(cursorRef.current);
    setSearchText("");
    echo.current = "";
  }

  const lines = speechLines(infinitive, forms, hAspire.has(infinitive));
  const actions = (primary: JSX.Element) => (
    <ActionPanel>
      {primary}
      <Action title="检查" icon={Icon.Check} shortcut={{ modifiers: ["cmd"], key: "return" }} onAction={check} />
      {lines.map((line) => (
        <Action
          key={line.id}
          title={line.zh}
          icon={Icon.Speaker}
          shortcut={shortcutFor(line)}
          onAction={() => playSpeech(line.speech, line.zh)}
        />
      ))}
      <Action title="清空" icon={Icon.Trash} shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }} onAction={reset} />
      <Action
        title={layout === "persons" ? "时态做列" : "人称做列"}
        icon={Icon.AppWindowGrid2x2}
        onAction={() => setLayoutPersistent(layout === "persons" ? "tenses" : "persons")}
      />
      <Action
        title={mode === "tenses" ? "练习分词" : "练习变位"}
        icon={Icon.Switch}
        shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
        onAction={() => {
          const next = mode === "tenses" ? "parts" : "tenses";
          setMode(next);
          select(next === "parts" && forms!.pp.length ? "pp" : "c0-0");
        }}
      />
      <Action title="换一个动词" icon={Icon.Book} onAction={() => onPick("")} />
      <Action
        title="加入我的动词"
        icon={Icon.Plus}
        onAction={() =>
          void addMine(infinitive).then((added) =>
            showToast({ style: Toast.Style.Success, title: added ? "已加入我的动词" : "已经在我的动词里" }),
          )
        }
      />
      <Action
        title="移出我的动词"
        icon={Icon.Minus}
        onAction={() =>
          void removeMine(infinitive).then(() => showToast({ style: Toast.Style.Success, title: "已移出我的动词" }))
        }
      />
      <Action.Push title="编辑我的动词" icon={Icon.Pencil} target={<EditMine />} />
      <Action
        title="随机我的"
        icon={Icon.Shuffle}
        onAction={() =>
          void loadMine().then((list) => {
            if (!list.length) {
              showToast({ style: Toast.Style.Failure, title: "我的动词还是空的" });
              return;
            }
            onPick(randomOf(list));
          })
        }
      />
      <Action title="随机常用" icon={Icon.Shuffle} onAction={() => onPick(randomVerb("common"))} />
      <Action title="随机全部" icon={Icon.Shuffle} onAction={() => onPick(randomVerb("all"))} />
    </ActionPanel>
  );

  const participleIds = [...(forms.pp.length ? ["pp"] : []), ...(forms.prp.length ? ["prp"] : [])];
  const tenseRows = TENSES.map((_, tense) => ROWS.map((__, person) => `c${person}-${tense}`));
  const personRows = ROWS.map((_, person) => TENSES.map((__, tense) => `c${person}-${tense}`));
  const byTense = layout === "persons";

  function renderItem(id: string) {
    const slot = slotOf(forms!, answers, checked, cursor, id);
    return (
      <Grid.Item
        key={id}
        id={id}
        content={cellImage(slot.main, slot.label, slot.style, slot.correct)}
        actions={actions(
          <Action
            title={byTense ? "右一格" : "下一格"}
            icon={byTense ? Icon.ArrowRight : Icon.ArrowDown}
            onAction={moveNext}
          />,
        )}
      />
    );
  }

  return (
    <Grid
      navigationTitle={infinitive}
      columns={6}
      aspectRatio="16/9"
      inset={Grid.Inset.Zero}
      fit={Grid.Fit.Fill}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={onSearch}
      onSelectionChange={onSelectionChange}
      selectedItemId={cursor}
      searchBarPlaceholder={`填写 ${slotLabel(cursor)} · 方向键换格 · 回车${byTense ? "右" : "下"}一格 · ⌘↩ 检查`}
    >
      {mode === "parts" ? (
        <Grid.Section columns={2} aspectRatio="16/9" inset={Grid.Inset.Zero} fit={Grid.Fit.Fill}>
          {participleIds.map(renderItem)}
        </Grid.Section>
      ) : (
        (byTense ? tenseRows : personRows).map((ids, index) => (
          <Grid.Section key={index} columns={6} aspectRatio="16/9" inset={Grid.Inset.Zero} fit={Grid.Fit.Fill}>
            {ids.map(renderItem)}
          </Grid.Section>
        ))
      )}
    </Grid>
  );
}

function shortcutFor(line: SpeechLine) {
  if (line.id === "part") return { modifiers: ["cmd" as const], key: "0" as const };
  const match = /^t(\d)$/.exec(line.id);
  const key = match ? TENSE_KEYS[Number(match[1])] : undefined;
  if (!key) return undefined;
  return { modifiers: ["cmd" as const], key };
}

function editable(forms: VerbForms, id: string) {
  return Boolean(expectedOf(forms, id));
}

function editableIds(forms: VerbForms) {
  const ids: string[] = [];
  if (forms.pp.length) ids.push("pp");
  if (forms.prp.length) ids.push("prp");
  for (let tense = 0; tense < TENSES.length; tense++) {
    for (let row = 0; row < ROWS.length; row++) {
      const id = `c${row}-${tense}`;
      if (expectedOf(forms, id)) ids.push(id);
    }
  }
  return ids;
}

function slotOf(
  forms: VerbForms,
  answers: Record<string, string>,
  checked: boolean,
  cursor: string,
  id: string,
): BoardSlot {
  const text = cellText(forms, answers, checked, id);
  return { ...text, style: cellStyle(forms, answers, checked, cursor, id) };
}

function cellText(forms: VerbForms, answers: Record<string, string>, checked: boolean, id: string) {
  const label =
    id === "pp" ? "过去分词" : id === "prp" ? "现在分词" : id.startsWith("c0-") ? (TENSES[Number(id.slice(3))]?.zh ?? "") : "";
  if (!expectedOf(forms, id)) return { main: "", label, correct: undefined as string | undefined };
  const raw = (answers[id] ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return { main: "____", label, correct: undefined };
  const expected = expectedOf(forms, id);
  if (checked && expected && gradeAnswer(expected, raw) === "bad") {
    return { main: raw, label, correct: showForms(expected) };
  }
  return { main: raw, label, correct: undefined };
}

function cellStyle(
  forms: VerbForms,
  answers: Record<string, string>,
  checked: boolean,
  cursor: string,
  id: string,
): CellStyle {
  if (!expectedOf(forms, id)) return "na";
  const raw = (answers[id] ?? "").trim();
  if (checked && raw) return gradeAnswer(expectedOf(forms, id), raw) === "bad" ? "bad" : "ok";
  if (cursor === id) return "selected";
  return "plain";
}
