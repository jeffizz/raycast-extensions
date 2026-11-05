import { Action, ActionPanel, Detail, Icon, showToast, Toast, type Keyboard, type LaunchProps } from "@raycast/api";
import { book, hAspire } from "./data";
import { EditMine } from "./edit-mine";
import { speechLines, tableMarkdown, type SpeechLine } from "./model";
import { addMine, removeMine } from "./mine";
import { OpenVerb } from "./open-verb";
import { playSpeech } from "./speech";

const TENSE_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

export default function LookupCommand(props: LaunchProps) {
  return (
    <OpenVerb
      fallbackText={props.fallbackText}
      render={({ infinitive, pick }) => <LookupView infinitive={infinitive} onPick={pick} />}
    />
  );
}

function LookupView({ infinitive, onPick }: { infinitive: string; onPick: (infinitive: string) => void }) {
  const forms = book.verbs[infinitive];
  if (!forms) return <Detail markdown="没有这个动词" />;
  const lines = speechLines(infinitive, forms, hAspire.has(infinitive));

  return (
    <Detail
      navigationTitle={infinitive}
      markdown={tableMarkdown(infinitive, forms)}
      actions={
        <ActionPanel>
          {lines.map((line) => (
            <Action
              key={line.id}
              title={line.zh}
              icon={Icon.Speaker}
              shortcut={shortcutFor(line)}
              onAction={() => playSpeech(line.speech, line.zh)}
            />
          ))}
          <Action title="换一个动词" icon={Icon.Book} shortcut={{ modifiers: ["cmd"], key: "n" }} onAction={() => onPick("")} />
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
        </ActionPanel>
      }
    />
  );
}

function shortcutFor(line: SpeechLine): Keyboard.Shortcut | undefined {
  if (line.id === "part") return { modifiers: ["cmd"], key: "0" };
  const match = /^t(\d)$/.exec(line.id);
  if (!match) return undefined;
  return { modifiers: ["cmd"], key: TENSE_KEYS[Number(match[1])] };
}
