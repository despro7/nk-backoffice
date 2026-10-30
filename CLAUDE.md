# nova-field (NK Food Shop backoffice)

@.cursor/rules/project-context.mdc
@.cursor/rules/agent-workflow.mdc

## Claude Code — уточнення

- Відповідай українською. Код, ідентифікатори, commit message — англійською.
- План → підтвердження → зміни. Виняток: мала однозначна правка в 1–2 файлах.
- Client UI: перед змінами в `client/**` прочитай `.cursor/rules/design-system-hub.mdc`,
  `client-heroui-ui.mdc`, `component-reuse.mdc` і відповідний `design-system-*`.
- CodeGraph: `.codegraph/` є — спершу `codegraph explore` / `codegraph node`, потім grep.
- Subagents (cavecrew) — лише за явним проханням.
- `npm run dev` відкриває SSH-тунель до БД (`netcup`, порт 3307) — не запускай без потреби.

## Перевірка після змін

- Server: `npx tsc -p tsconfig.server.json --noEmit`
- Client: `npx tsc --noEmit`
- Тести: `npx vitest run <path>` для зачеплених spec; `npm run lint` за потреби.
- Prisma schema змінено → `npx prisma migrate dev` + `npm run db:generate`.

## Модулі

- Chatwoot Bot: `server/modules/ChatwootBot/`, типи `shared/types/chatwootBot*.ts`,
  документація `Docs/integrations/chatwoot-agent-bot.md`. Spec поруч із файлом (`*.spec.ts`).

## Документація

- `Docs/CHANGELOG.md` і `Docs/**` змінюй лише після підтвердження користувача.
