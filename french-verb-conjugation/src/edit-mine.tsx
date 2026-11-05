import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { loadMine, parseMine, saveMine } from "./mine";

export function EditMine({ onSaved }: { onSaved?: () => void }) {
  const { pop } = useNavigation();
  const [text, setText] = useState("");

  useEffect(() => {
    void loadMine().then((names) => setText(names.join("\n")));
  }, []);

  return (
    <Form
      navigationTitle="我的动词"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="保存"
            onSubmit={async () => {
              const { known, unknown } = parseMine(text);
              await saveMine(known);
              await showToast({
                style: unknown.length ? Toast.Style.Failure : Toast.Style.Success,
                title: `已保存 ${known.length} 个`,
                message: unknown.length ? `词库里没有：${unknown.slice(0, 6).join("、")}` : "常用和全部仍然保留",
              });
              onSaved?.();
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="verbs"
        title="原形"
        placeholder={"être\navoir\naller"}
        value={text}
        onChange={setText}
      />
      <Form.Description title="说明" text="一行一个，或用逗号分开。只练习这份列表时，用「随机我的」。常用和全部不受影响。" />
    </Form>
  );
}
