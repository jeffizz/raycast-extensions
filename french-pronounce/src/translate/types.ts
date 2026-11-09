export type SourceLanguage = "fr" | "en" | "auto";
export type TargetLanguage = "zh";

export interface TranslateRequest {
  text: string;
  source: SourceLanguage;
  target: TargetLanguage;
}

export interface TranslationEngine {
  id: string;
  title: string;
  translate(request: TranslateRequest): Promise<string>;
}
