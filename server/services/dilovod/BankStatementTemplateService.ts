import { prisma } from '../../lib/utils.js';
import {
  DEFAULT_BANK_STATEMENT_TEMPLATE,
  type BankStatementTemplate,
  type BankStatementTemplatesState,
} from '../../../shared/types/bankStatement.js';

const KEY = 'bank_statement_templates';
const CATEGORY = 'accounting';

function ensureBuiltIn(state: BankStatementTemplatesState): BankStatementTemplatesState {
  const templates = [...state.templates];
  if (!templates.some((t) => t.id === DEFAULT_BANK_STATEMENT_TEMPLATE.id)) {
    templates.unshift(DEFAULT_BANK_STATEMENT_TEMPLATE);
  }
  const activeId = templates.some((t) => t.id === state.activeId)
    ? state.activeId
    : DEFAULT_BANK_STATEMENT_TEMPLATE.id;
  return {
    activeId,
    templates,
    kindKeywords: state.kindKeywords && typeof state.kindKeywords === 'object' ? state.kindKeywords : {},
    inlineEditColumns: Array.isArray(state.inlineEditColumns) ? state.inlineEditColumns : [],
  };
}

export class BankStatementTemplateService {
  async getState(): Promise<BankStatementTemplatesState> {
    const row = await prisma.settingsBase.findUnique({ where: { key: KEY } });
    if (!row?.value) {
      return {
        activeId: DEFAULT_BANK_STATEMENT_TEMPLATE.id,
        templates: [DEFAULT_BANK_STATEMENT_TEMPLATE],
      };
    }
    try {
      const parsed = JSON.parse(row.value) as BankStatementTemplatesState;
      if (!Array.isArray(parsed.templates)) {
        throw new Error('invalid');
      }
      return ensureBuiltIn(parsed);
    } catch {
      return {
        activeId: DEFAULT_BANK_STATEMENT_TEMPLATE.id,
        templates: [DEFAULT_BANK_STATEMENT_TEMPLATE],
      };
    }
  }

  async saveState(next: BankStatementTemplatesState): Promise<BankStatementTemplatesState> {
    const state = ensureBuiltIn({
      activeId: next.activeId,
      templates: next.templates.map((t) =>
        t.id === DEFAULT_BANK_STATEMENT_TEMPLATE.id ? { ...t, builtIn: true } : { ...t, builtIn: false },
      ),
      kindKeywords: next.kindKeywords,
      inlineEditColumns: next.inlineEditColumns,
    });

    await prisma.settingsBase.upsert({
      where: { key: KEY },
      create: {
        key: KEY,
        value: JSON.stringify(state),
        category: CATEGORY,
        isActive: true,
        description: 'Шаблони парсингу банківських виписок',
      },
      update: {
        value: JSON.stringify(state),
        category: CATEGORY,
        isActive: true,
      },
    });

    return state;
  }

  async upsertTemplate(template: BankStatementTemplate, makeActive = true): Promise<BankStatementTemplatesState> {
    const state = await this.getState();
    const idx = state.templates.findIndex((t) => t.id === template.id);
    const isBuiltIn = template.id === DEFAULT_BANK_STATEMENT_TEMPLATE.id;
    const saved: BankStatementTemplate = {
      ...template,
      id: template.id,
      builtIn: isBuiltIn,
      name: isBuiltIn ? DEFAULT_BANK_STATEMENT_TEMPLATE.name : template.name,
    };
    if (idx >= 0) state.templates[idx] = saved;
    else state.templates.push(saved);
    if (makeActive) state.activeId = saved.id;
    return this.saveState(state);
  }

  async deleteTemplate(id: string): Promise<BankStatementTemplatesState> {
    if (id === DEFAULT_BANK_STATEMENT_TEMPLATE.id) {
      throw new Error('Вбудований шаблон не можна видалити');
    }
    const state = await this.getState();
    state.templates = state.templates.filter((t) => t.id !== id);
    if (state.activeId === id) state.activeId = DEFAULT_BANK_STATEMENT_TEMPLATE.id;
    return this.saveState(state);
  }

  async patchExtras(partial: {
    kindKeywords?: Record<string, string[]>;
    inlineEditColumns?: BankStatementTemplatesState['inlineEditColumns'];
  }): Promise<BankStatementTemplatesState> {
    const state = await this.getState();
    if (partial.kindKeywords !== undefined) state.kindKeywords = partial.kindKeywords;
    if (partial.inlineEditColumns !== undefined) state.inlineEditColumns = partial.inlineEditColumns;
    return this.saveState(state);
  }

  async setActive(id: string): Promise<BankStatementTemplatesState> {
    const state = await this.getState();
    if (!state.templates.some((t) => t.id === id)) {
      throw new Error('Шаблон не знайдено');
    }
    state.activeId = id;
    return this.saveState(state);
  }
}

export const bankStatementTemplateService = new BankStatementTemplateService();
