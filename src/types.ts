export interface KeyVocabularyItem {
  word: string;
  phonetic: string;
  meaning: string;
}

export interface TranslationResult {
  fanteTranslation: string;
  literalTranslation: string;
  keyVocabulary: KeyVocabularyItem[];
  culturalNote: string;
  rawMarkdown: string;
  transcribedText?: string;
}

export interface SampleExpression {
  english: string;
  category: string;
}

export interface HistoryItem {
  id: string;
  english: string;
  result: TranslationResult;
  timestamp: number;
}

export interface DeepContextData {
  etymology: string;
  vowelMutations: string;
  culturalMetaphors: string;
  grammaticalBreakdown: string;
}

