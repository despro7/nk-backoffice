import type { LlmToolTraceEntry } from '../types/llm.js';

const MAX_TOOL_RESULT_CHARS = 6_000;

export function stringifyToolTraceValue(value: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(value, null, 2);
  } catch {
    json = String(value);
  }
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return `${json.slice(0, MAX_TOOL_RESULT_CHARS)}\n… (обрізано, ще ${json.length - MAX_TOOL_RESULT_CHARS} символів)`;
}

/** Секція для тех. логу тесту AI (args + відповідь tool). */
export function formatLlmToolTraceSection(entries: LlmToolTraceEntry[]): string {
  if (entries.length === 0) return '';

  const blocks = entries.map((entry) => {
    const argsJson = JSON.stringify(entry.arguments ?? {}, null, 2);
    const resultBlock = stringifyToolTraceValue(entry.result);
    return [
      `[${entry.step}] ${entry.name} (api round ${entry.apiRound})`,
      'arguments:',
      argsJson,
      'result:',
      resultBlock,
    ].join('\n');
  });

  return ['--- tools trace ---', ...blocks].join('\n\n');
}
