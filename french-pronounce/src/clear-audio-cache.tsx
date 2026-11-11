import { Alert, confirmAlert, showHUD } from "@raycast/api";
import { clearAudioCache } from "./audio-cache";

export default async function Command() {
  const confirmed = await confirmAlert({
    title: "Clear pronunciation audio cache?",
    message: "Permanently delete cached Frdic and ElevenLabs audio. API keys and settings are not affected. Future requests may use ElevenLabs credits.",
    primaryAction: { title: "Clear Audio Cache", style: Alert.ActionStyle.Destructive },
  });
  if (!confirmed) return;
  try {
    const { deleted, bytes, failed } = await clearAudioCache();
    const size = `${(bytes / 1_000_000).toFixed(2)} MB`;
    await showHUD(failed
      ? `Cleared ${deleted} audio files (${size}); ${failed} failed`
      : `Cleared ${deleted} audio files (${size})`);
  } catch {
    await showHUD("Could not clear audio cache");
  }
}
