/**
 * Фільтр каталогу моделей для backoffice: chat completion + function tools (Chatwoot bot).
 */

import { isGoogleLlmModelSupersededInCatalog } from './googleLlmModelAliases.js';

const OPENAI_ID_EXCLUDE_SUBSTRINGS = [
  'embedding',
  'embed',
  'whisper',
  'tts',
  'transcribe',
  'audio',
  'realtime',
  'dall-e',
  'dalle',
  'gpt-image',
  'moderation',
  'omni-moderation',
  'babbage',
  'davinci',
  'curie',
  'ada',
  'text-embedding',
  'text-search',
  'code-search',
  'similarity',
  'gpt-live',
  'codex',
];

function openAiGptMajorVersion(id: string): number | null {
  const m = id.match(/^gpt-(\d+)/);
  if (!m) return null;
  return Number(m[1]);
}

export function isOpenAiPlatformChatModel(id: string): boolean {
  const lower = id.trim().toLowerCase();
  if (!lower) return false;

  if (OPENAI_ID_EXCLUDE_SUBSTRINGS.some((part) => lower.includes(part))) {
    return false;
  }

  if (/^o\d/.test(lower)) return false;
  if (lower.includes('-instruct')) return false;
  if (lower.includes('search-preview')) return false;
  if (lower.startsWith('ft:')) return false;

  if (lower.startsWith('chatgpt-')) {
    return true;
  }

  const major = openAiGptMajorVersion(lower);
  if (major == null || major < 5) return false;

  return true;
}

const GEMINI_ID_EXCLUDE_SUBSTRINGS = [
  'embed',
  'imagen',
  'veo',
  'aqa',
  'tts',
  'nano-banana',
  'robotics',
  'computer-use',
  'learnlm',
];

export function isGeminiPlatformChatModel(id: string): boolean {
  const lower = id.replace(/^models\//, '').trim().toLowerCase();
  if (isGoogleLlmModelSupersededInCatalog(lower)) return false;
  if (!lower.startsWith('gemini-')) return false;

  const ver = lower.match(/^gemini-(\d+)/);
  if (!ver || Number(ver[1]) < 2) return false;

  if (GEMINI_ID_EXCLUDE_SUBSTRINGS.some((part) => lower.includes(part))) return false;
  if (/gemini-1\.[05]/.test(lower)) return false;
  if (lower === 'gemini-pro' || lower === 'gemini-pro-vision') return false;

  if (lower.includes('-image')) return false;

  return true;
}

export type OpenRouterModelCatalogRow = {
  id?: string;
  architecture?: {
    modality?: string;
    output_modalities?: string[];
  };
  supported_parameters?: string[];
};

export function openRouterModelBaseId(id: string): string {
  const slash = id.indexOf('/');
  return slash >= 0 ? id.slice(slash + 1) : id;
}

export function isOpenRouterPlatformChatModel(row: OpenRouterModelCatalogRow): boolean {
  const id = row.id?.trim();
  if (!id) return false;
  const lower = id.toLowerCase();

  if (lower.includes('embed') || lower.includes('moderation') || lower.includes('rerank')) {
    return false;
  }
  if (lower.includes(':batch') || lower.endsWith('/batch')) return false;

  const params = row.supported_parameters ?? [];
  if (!params.includes('tools')) return false;

  const outputs = row.architecture?.output_modalities ?? [];
  if (outputs.length > 0 && !outputs.includes('text')) return false;

  const modality = row.architecture?.modality ?? '';
  if (modality && !modality.includes('text')) return false;
  if (modality.includes('->image') && !modality.includes('->text')) return false;

  const base = openRouterModelBaseId(id);
  if (base.startsWith('gpt-') || base.startsWith('chatgpt-') || /^o\d/.test(base)) {
    return isOpenAiPlatformChatModel(base);
  }
  if (base.startsWith('gemini-')) {
    return isGeminiPlatformChatModel(base);
  }

  return true;
}
