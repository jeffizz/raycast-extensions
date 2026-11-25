import { Provider } from "./core";
export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  pricing?: { prompt?: string; completion?: string };
  supportedParameters?: string[];
};
export const recommendations: Record<Provider, string> = {
  openai:
    "Suggested starting point: gpt-4.1-mini for short vocabulary tasks. Not selected automatically.",
  gemini:
    "Suggested starting point: gemini-3.5-flash-lite for short vocabulary tasks, if available in your account. Not selected automatically.",
  deepseek:
    "Suggested starting point: deepseek-flash for short vocabulary tasks, if available. Not selected automatically.",
  openrouter:
    "Suggested starting point: openai/gpt-4.1-mini. Availability and charges depend on routing. Not selected automatically.",
};
export function modelAssessment(model: ModelOption) {
  const id = model.id.toLowerCase();
  const blocked =
    /embedding|whisper|^tts-|transcri|dall-e|^gpt-image|moderation|realtime|^veo|^imagen/.test(
      id,
    );
  const recommended = !blocked && /mini|flash|deepseek-chat/.test(id);
  return {
    blocked,
    recommended,
    rank: blocked ? 3 : recommended ? 0 : 1,
    reason: blocked
      ? "Not supported by this text JSON workflow"
      : recommended
        ? "Suggested for short vocabulary tasks (heuristic)"
        : "Compatibility unknown — test JSON output",
  };
}
export function parseModels(provider: Provider, value: unknown): ModelOption[] {
  const data = value as {
    data?: {
      id?: string;
      name?: string;
      description?: string;
      pricing?: { prompt?: string; completion?: string };
      supported_parameters?: string[];
    }[];
    models?: {
      name?: string;
      displayName?: string;
      description?: string;
      supportedGenerationMethods?: string[];
    }[];
  };
  const items =
    provider === "gemini"
      ? (data.models ?? [])
          .filter((m) =>
            m.supportedGenerationMethods?.includes("generateContent"),
          )
          .map((m) => ({
            id: m.name?.replace(/^models\//, ""),
            name: m.displayName,
            description: m.description,
          }))
      : (data.data ?? []);
  return [
    ...new Map(
      items
        .filter(
          (m) =>
            typeof m.id === "string" && m.id.length > 0 && m.id.length < 200,
        )
        .map((m) => {
          const metadata = m as {
            description?: string;
            pricing?: { prompt?: string; completion?: string };
            supported_parameters?: string[];
          };
          return [
            m.id!,
            {
              id: m.id!,
              name: m.name ?? m.id!,
              ...(metadata.description
                ? { description: metadata.description.slice(0, 500) }
                : {}),
              ...(metadata.pricing ? { pricing: metadata.pricing } : {}),
              ...(metadata.supported_parameters
                ? { supportedParameters: metadata.supported_parameters }
                : {}),
            },
          ] as const;
        }),
    ).values(),
  ].sort((a, b) => a.id.localeCompare(b.id));
}
