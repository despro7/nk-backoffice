# HR UX — план Фаза 2+

> Залишок після аудиту HR-змін 12–14.09.2026. Фаза 1 (guard + ConfirmModal) виконана 14.09.2026.  
> **Фаза 2+ (п. 1–4, 6–9) виконана 14.09.2026.** П. 5 свідомо відкладено — ризик візуальних регресій.

## Статус виконання

| # | Задача | Пріоритет | Статус |
|---|--------|-----------|--------|
| 1 | `UserCard` → `useUnsavedGuard` + `isDirty` | P0 | ✅ |
| 2 | `EmployeeDrawer` — розширити `isDirty` (зайнятості, ставки) | P0 | ✅ |
| 3 | `ProductionCalendarTab` — dirty state + guard при виході з таба | P0 | ✅ |
| 4 | Архітектура: `person-card` ↔ `pages/Hr/components` (інвертована залежність) | P2 | ✅ |
| 5 | Міграція HR drawer-ів на `DrawerShell` + semantic tokens | P2 | ⏸ відкладено |
| 6 | Об'єднати merge UI (`PersonMergeModal` для PersonCard + Persons) | P2 | ✅ |
| 7 | `formatMoney` → спільний helper (`client/lib/formatUtils.ts`) | P2 | ✅ |
| 8 | Тести: `HrFopService`, `HrBonusService`, merge | P3 | ✅ |
| 9 | `Fop/index.tsx` — toast при помилці API | P3 | ✅ |

## Деталі по задачах

### 1. UserCard — unsaved guard

- Патерн як у `PersonCard.tsx`: panel експортує `isDirty` через callback, `useUnsavedGuard` на закриття.
- Файли: `client/components/person-card/UserCard.tsx`, `panels/UserCardPanel.tsx`.

### 2. EmployeeDrawer — повний isDirty

- Snapshot має враховувати: `addingEmployment`, `employmentForm`, незбережений `payForm` / `addingRate`.
- Альтернатива: блокувати закриття, поки `addingEmployment || addingRate`.
- Файл: `client/pages/Hr/Employees/EmployeeDrawer.tsx`.

### 3. ProductionCalendarTab — dirty state

- Snapshot config після load/save.
- Кнопка «Зберегти» disabled коли clean.
- Guard при перемиканні таба в `Employers/index.tsx` або `beforeunload`.
- Файл: `client/pages/Hr/Employers/ProductionCalendarTab.tsx`.

### 4. Архітектура person-card ✅

- HR-специфічні accordion/chip винесені в `client/components/hr/`: `HrAuditAccordion`, `PersonDuplicatesAccordion`, `PersonMergedAccordion`, `PersonStatusChip`.
- `PersonCardPanel` імпортує з `@/components/hr/*` — інвертована залежність усунена.
- `HrAuditLogEntry` лишається в `client/pages/Hr/components/` (використовується табелем).

### 5. DrawerShell + tokens ⏸

Відкладено за рішенням продукту: міграція на примітиви, яких ще немає в репозиторії, несе ризик зміни відступів, тіней і кольорів без функціональної потреби.

Коли виконуватиметься:

- Замінити сирі HeroUI `Drawer` на `DrawerShell` / `DrawerField` / `UiButton`.
- Прибрати `text-gray-*` у `PayrollLineDrawer`, `HrTimesheetPage`, `HrPayrollPage`.
- `shadow-2xl` → `shadow-overlay` на PersonCard/UserCard.

### 6. PersonMergeModal ✅

- `client/pages/Hr/components/PersonMergeModal.tsx` — варіанти `radio` (вибір головного запису з кандидатів) і `select` (джерело → ціль).
- Використовується в `PersonCardPanel` і `Persons/index.tsx`.

### 7. formatMoney ✅

- `formatMoney()` у `client/lib/formatUtils.ts`; підключено в `Bonuses`, `Fop`, `PayrollLineDrawer`.

### 8. Backend тести ✅

- `HrFopService.spec.ts` — warning при 0 `includedDays` у табелі.
- `HrBonusService.spec.ts` — валідація `dateFrom > dateTo`.
- `HrEmploymentMerge.spec.ts` — dedupe / перенос pay terms при merge.

## Рекомендований порядок (залишок)

```
P2  DrawerShell + semantic tokens (п. 5) — лише після появи примітивів і візуального OK
```

## Пов'язані документи

- `Docs/architecture/unsaved-guard.md`
- `Docs/features/hr-module.md`
