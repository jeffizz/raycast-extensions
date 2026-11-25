import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { showFailureToast, useForm, usePromise } from "@raycast/utils";
import { useRef, useState } from "react";
import {
  defaultIndicatorColors,
  indicatorKeys,
  indicatorLabels,
  IndicatorColors,
  parseIndicatorColors,
} from "../core/indicator-colors";
import {
  loadIndicatorColors,
  saveIndicatorColors,
} from "./indicator-color-storage";
import { renderStatusIcon } from "./status";

const presets = [
  ["Blue", "#52a8ff"],
  ["Sky", "#38bdf8"],
  ["Cyan", "#22d3ee"],
  ["Teal", "#29b8a5"],
  ["Green", "#54bd76"],
  ["Lime", "#a3e635"],
  ["Yellow", "#facc15"],
  ["Amber", "#f5a623"],
  ["Orange", "#ed9854"],
  ["Red", "#f87171"],
  ["Rose", "#fb7185"],
  ["Pink", "#e879bd"],
  ["Magenta", "#e879f9"],
  ["Purple", "#a78bfa"],
  ["Indigo", "#818cf8"],
  ["Slate", "#94a3b8"],
  ["Grey", "#a3a3a3"],
  ["White", "#eeeeee"],
] as const;

function ColourPreview({ color }: { color: string }) {
  return (
    <List.Item.Detail
      markdown={
        "# Indicator Preview\n\nChoose a colour on the left. These are the actual list icons, rendered at their native size. The question mark and checkmark retain their familiarity colours.\n\nPreviewing does not save or apply changes."
      }
      metadata={
        <List.Item.Detail.Metadata>
          {(
            [
              ["unmarked", "Circle"],
              ["fuzzy", "Circle + Question Mark"],
              ["known", "Circle + Checkmark"],
            ] as const
          ).map(([state, label]) => (
            <List.Item.Detail.Metadata.Label
              key={state}
              title={label}
              text=""
              icon={renderStatusIcon(state, color)!}
            />
          ))}
        </List.Item.Detail.Metadata>
      }
    />
  );
}
export function IndicatorColorSettings({
  onSaved,
}: {
  onSaved: () => Promise<void>;
}) {
  const { data, isLoading } = usePromise(loadIndicatorColors);
  return data ? (
    <ColourSettings initial={data} onSaved={onSaved} />
  ) : (
    <List isLoading={isLoading} />
  );
}
function ColourSettings({
  initial,
  onSaved,
}: {
  initial: IndicatorColors;
  onSaved: () => Promise<void>;
}) {
  const { pop, push } = useNavigation();
  const [draft, setDraft] = useState<IndicatorColors>(initial);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await saveIndicatorColors(draft);
      await onSaved();
      await showToast({
        style: Toast.Style.Success,
        title: "Indicator Colours Saved",
      });
      pop();
    } catch (error) {
      await showFailureToast(error);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const choose = (key: keyof IndicatorColors) =>
    push(
      <ColourPicker
        title={indicatorLabels[key]}
        current={draft[key]}
        onChoose={(color) =>
          setDraft((previous) => ({ ...previous, [key]: color }))
        }
      />,
    );
  const common = (
    <>
      <Action title="Save All Colours" icon={Icon.Checkmark} onAction={save} />
      <Action
        title="Restore Default Colours"
        onAction={() => setDraft({ ...defaultIndicatorColors })}
      />
    </>
  );
  return (
    <List
      navigationTitle="Content Indicator Colours"
      isShowingDetail
      isLoading={busy}
      actions={<ActionPanel>{common}</ActionPanel>}
    >
      <List.Section title="Choose a content type · Changes remain a draft until saved">
        {indicatorKeys.map((key) => (
          <List.Item
            key={key}
            title={indicatorLabels[key]}
            icon={{ source: Icon.Circle, tintColor: draft[key] }}
            accessories={[
              {
                icon:
                  draft[key] !== initial[key] ? Icon.Pencil : Icon.Checkmark,
                tooltip:
                  draft[key] !== initial[key]
                    ? "Unsaved colour change"
                    : "Saved colour",
              },
            ]}
            detail={<ColourPreview color={draft[key]} />}
            actions={
              <ActionPanel>
                <Action title="Choose Colour" onAction={() => choose(key)} />
                {common}
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
function ColourPicker({
  title,
  current,
  onChoose,
}: {
  title: string;
  current: string;
  onChoose: (color: string) => void;
}) {
  const { pop, push } = useNavigation();
  const [selected, setSelected] = useState(current);
  const options = [
    { name: "Current Colour", value: current },
    ...presets
      .filter(([, value]) => value !== current)
      .map(([name, value]) => ({ name, value })),
  ];
  const choose = (color: string) => {
    onChoose(color);
    pop();
  };
  const custom = (
    <Action
      title="Custom HEX"
      icon={Icon.Pencil}
      onAction={() =>
        push(
          <CustomColour
            current={selected}
            onChoose={(color) => {
              onChoose(color);
              pop();
              pop();
            }}
          />,
        )
      }
    />
  );
  return (
    <List
      navigationTitle={"Choose Colour · " + title}
      isShowingDetail
      searchBarPlaceholder="Search colours…"
      selectedItemId={selected}
      onSelectionChange={(id) => {
        if (id) setSelected(id);
      }}
      actions={<ActionPanel>{custom}</ActionPanel>}
    >
      {options.map((option) => (
        <List.Item
          key={option.value}
          id={option.value}
          title={option.name}
          icon={{ source: Icon.Circle, tintColor: option.value }}
          accessories={
            option.value === current
              ? [{ icon: Icon.Checkmark, tooltip: "Current draft colour" }]
              : []
          }
          detail={<ColourPreview color={option.value} />}
          actions={
            <ActionPanel>
              <Action
                title="Use Colour"
                onAction={() => choose(option.value)}
              />
              {custom}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
function CustomColour({
  current,
  onChoose,
}: {
  current: string;
  onChoose: (color: string) => void;
}) {
  const { handleSubmit, itemProps } = useForm<{ hex: string }>({
    initialValues: { hex: current },
    validation: {
      hex: (value) =>
        !value || !/^#[0-9a-f]{6}$/i.test(value.trim())
          ? "Enter a six-digit HEX colour, for example #52A8FF."
          : undefined,
    },
    onSubmit: ({ hex }) =>
      onChoose(
        parseIndicatorColors({ ...defaultIndicatorColors, examples: hex })
          .examples,
      ),
  });
  return (
    <Form
      navigationTitle="Custom HEX"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Use Custom Colour"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Optional advanced input. This updates only the draft; use Save All Colours on the main settings page to persist it." />
      <Form.TextField title="HEX Colour" {...itemProps.hex} />
    </Form>
  );
}
