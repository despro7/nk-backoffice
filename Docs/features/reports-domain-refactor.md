# Reports — доменний рефакторинг і shared-інфраструктура

Коротко: домен `client/pages/Reports` розбитий на окремі піддомени, а спільна логіка фільтрів, кешу, валідації та fetch-flow винесена в `shared`.

Куди дивитись:
- Сторінки домену: `client/pages/Reports/ReportsGeneral`, `client/pages/Reports/ReportsSales`, `client/pages/Reports/ReportsShipment`, `client/pages/Reports/ReportsSalesDynamics`
- Shared-шар: `client/pages/Reports/shared`
- Централізовані preset-и дат: `client/lib/dateReportingUtils.ts`
- Стабілізація API helper: `client/hooks/useApi.ts`

Що змінилось:
- Монолітний `Reports` розбитий на окремі entrypoint-и та піддомени з власними типами, утилітами і компонентами.
- Спільні типи й helpers винесені в `ReportsSharedTypes.ts` і `ReportsSharedUtils.ts`.
- Логіка `reporting day start hour` винесена в `useReportingDayStartHour.ts`.
- Загальну валідацію кешу та керування refresh-modal винесено в `useReportCacheValidation.ts`.
- Локальний клієнтський кеш для звітів винесено в `useReportClientCache.ts`.
- Повторюваний fetch-flow для product stats/date stats винесено в `useReportProductStatsFetchers.ts`.
- `General`, `Shipment` і chart/table частина `Sales` переведені на shared hooks замість локальних дублікатів.
- Локальні дублікати preset-ів дат прибрані: використовується `createStandardDatePresets()` з `dateReportingUtils.ts`.
- У `Sales` прибрані зайві alias-константи для дефолтних preset/group значень; у коді лишені прямі `last7Days`, `last30Days`, `day`.

Практичний результат:
- Менше дублювання між різними report-секціями.
- Простіше вносити зміни у cache validation, preset-и дат і fetch orchestration в одному місці.
- Нові report-компоненти легше додавати в ту ж структуру без копіювання логіки.

Примітка:
- Після рефакторингу перевірено типізацію через `npx tsc --noEmit -p tsconfig.json`; домен `Reports` лишився без нових TS-помилок.