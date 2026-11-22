import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { useForm } from "@raycast/utils";
import { Library, Mode } from "../core/model";
import { modeSettings } from "../core/practice-settings";
import { store, autoBackup } from "../runtime";
export function DailyLimits({
  library,
  mode,
  refresh,
}: {
  library: Library;
  mode: Mode;
  refresh: () => Promise<void>;
}) {
  const { pop } = useNavigation();
  const settings = modeSettings(library, mode);
  const validate = (value: string | undefined, optional = false) => {
    if (optional && !value?.trim()) return undefined;
    return !value?.trim() ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < 0 ||
      Number(value) > 100000
      ? "Enter a whole number from 0 to 100000."
      : undefined;
  };
  const { itemProps, handleSubmit } = useForm<{
    fresh: string;
    review: string;
  }>({
    initialValues: {
      fresh: String(settings.dailyNew ?? 10),
      review: settings.dailyReview == null ? "" : String(settings.dailyReview),
    },
    validation: {
      fresh: (value) => validate(value),
      review: (value) => validate(value, true),
    },
    onSubmit: async (values) => {
      await store.mutate((lib) => {
        lib.settings ??= {};
        lib.settings.practice ??= {};
        lib.settings.practice[mode] = {
          ...modeSettings(lib, mode),
          dailyNew: Number(values.fresh),
          dailyReview: values.review.trim() ? Number(values.review) : null,
        };
      });
      await refresh();
      void autoBackup();
      pop();
    },
  });
  return (
    <Form
      navigationTitle="Daily Limits"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Daily Limits"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Limits apply per mode across all sources, using the local calendar day. Due reviews come before new cards. All Included Words bypasses limits; answers still update FSRS." />
      <Form.TextField title="New Cards per Day" {...itemProps.fresh} />
      <Form.TextField
        title="Review Cards per Day"
        placeholder="Unlimited"
        info="Leave blank for unlimited. Zero pauses this category."
        {...itemProps.review}
      />
    </Form>
  );
}
