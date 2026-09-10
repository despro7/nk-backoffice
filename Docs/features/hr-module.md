# HR: табель, розрахунок, співробітники, роботодавці

**Дата:** 2026-09-11  
**Маршрути:** `/hr/timesheet`, `/hr/payroll`, `/hr/employees`, `/hr/employers`  
**API:** `/api/hr/*`  
**Модуль сервера:** `server/modules/Hr/`

---

## Огляд

Внутрішній облік робочих годин і виплат (паритет з Excel «Табель 2026»). Це **не** податковий облік.

| Розділ | Призначення |
| --- | --- |
| **Табель** | Введення годин і кодів дня по місяцях |
| **Розрахунок** | Знімок виплат за табелем, фіксація виплат |
| **Співробітники** | Каталог працівників, зайнятість, ставки, імпорт Excel |
| **Роботодавці** | Довідник юросіб / ФОП з конкретними назвами |

Каталог співробітників **не** змішується з обліковими `User` — привʼязка опційна.

---

## Права доступу

Ключі в `shared/constants/permissions.ts`:

| Ключ | Seed | Опис |
| --- | --- | --- |
| `page.hr.timesheet` | boss+ | Табель |
| `page.hr.payroll` | admin, boss | Розрахунок |
| `page.hr.employees` | boss+ | Співробітники і роботодавці |
| `action.hr.timesheet.edit` | boss+ | Редагування табеля |
| `action.hr.employees.manage` | boss+ | CRUD співробітників і роботодавців |
| `action.hr.payroll.view` | admin, boss | Розрахунок / блокування / виплати |
| `action.hr.payterms.manage` | boss+ | Ставки |
| `action.hr.payouts.view` | admin, boss | Повний номер картки |

---

## Модель даних (Prisma)

```
HrLegalEntity ──► HrEmployment ◄── HrEmployee
                       │
                       ├── HrPayTerms
                       ├── HrTimesheetEntry
                       ├── HrPayrollLine
                       └── HrPayout
```

- **`HrLegalEntity`** — роботодавець: `code` (унікальний slug), `name` (відображувана назва), `kind` (`fop` | `tov` | `unofficial_cash`), `isActive`.
- **`HrEmployment`** — зайнятість: працівник × роботодавець × група оплати × період.
- **`HrPayGroup`:** `official_salary`, `hourly`, `unofficial_cash`.

Seed-записи (міграція `20260903010000_add_hr_employees`):

| code | name (за замовч.) | kind |
| --- | --- | --- |
| `fop` | ФОП | fop |
| `tov` | ТОВ | tov |
| `unofficial_cash` | Нештатні (готівка) | unofficial_cash |

Їх можна **перейменувати** в довіднику (напр. «ФОП Бубнова М.В.»). Для кількох ФОП — створити додаткові записи з тим самим `kind`.

---

## Роботодавці (`/hr/employers`)

**UI:** `client/pages/Hr/Employers/index.tsx`

- Таблиця всіх роботодавців (активних і неактивних).
- Створення / редагування: назва, тип, прапорець «Активний».
- Деактивувати **останнього** активного роботодавця певного типу неможливо (потрібен для імпорту Excel).
- У seed-записів (`fop`, `tov`, `unofficial_cash`) тип при редагуванні заблокований; назву змінити можна.

**API:**

| Метод | Шлях | Право |
| --- | --- | --- |
| GET | `/api/hr/legal-entities` | `page.hr.employees` |
| GET | `/api/hr/legal-entities?includeInactive=true` | те саме, повний список |
| POST | `/api/hr/legal-entities` | `action.hr.employees.manage` |
| PUT | `/api/hr/legal-entities/:id` | `action.hr.employees.manage` |

Тіло: `{ name, kind, isActive? }` — тип `HrLegalEntityWritePayload` у `shared/types/hr.ts`.

**Імпорт Excel:** при створенні зайнятості шукається роботодавець спочатку за `code`, потім — перший активний з відповідним `kind` (`HrXlsxImportService`).

**Кольори бейджів:** `hrLegalEntityKindTokens(kind)` / `hrEmployerTokensFromName(name)` у `client/pages/Hr/hrUi.tsx`.

---

## Табель (`/hr/timesheet`)

**UI:** `client/pages/Hr/HrTimesheetPage.tsx`, `client/pages/Hr/Timesheet/*`

### Toolbar

1. Пошук за ПІБ  
2. Перемикач місяця  
3. Дії (заповнити вихідні, зберегти, до розрахунку)

### Фільтри груп

`PageTabs` (secondary) **над таблицею**: Усі / Офіційна ставка / Погодинні / Нештатні. Стан у query `?group=`.

### Таблиця (`TimesheetGrid`)

- Sticky header (патерн з `HierarchicalReportTable`).
- Згортання правого сайдбару підсумків (за замовч. згорнутий; лише колонка «год»).
- Кольорові заголовки груп (`hrPayGroupTokens`).
- Редагування: цифра — години, літера — код; F2 / подвійний клік / контекстне меню — години.
- Легенда кодів дня з налаштуванням hue (`TimesheetKindLegend`, `useHrTimesheetKindColors`).

### API

- `GET /api/hr/timesheet?month=YYYY-MM`
- `PUT /api/hr/timesheet/:id` — optimistic locking через `version`

---

## Розрахунок (`/hr/payroll`)

**UI:** `client/pages/Hr/HrPayrollPage.tsx`, `client/pages/Hr/Payroll/*`

### Toolbar (як у табелі)

1. Пошук за ПІБ  
2. Перемикач місяця  
3. Статус (попередній перегляд / знімок / заблоковано), «До табеля», «Розрахувати», «Заблокувати»

### Фільтри груп

`PageTabs` над таблицею — той самий набір, що в табелі. Query `?month=&group=` синхронізується між сторінками.

### Таблиця (`PayrollTable`)

- Темна sticky-шапка, кольорові рядки-групи.
- Бейдж роботодавця за **конкретною назвою** (`legalEntityName`).
- Клік по рядку — drawer з деталями і виплатами.

### API

- `GET /api/hr/payroll?month=YYYY-MM`
- `POST /api/hr/payroll/calculate`
- `POST /api/hr/payroll/:id/lock`
- CRUD виплат: `/api/hr/payroll/:id/payouts`, `/api/hr/payouts/:id`

---

## Співробітники (`/hr/employees`)

**UI:** `client/pages/Hr/Employees/` (`index.tsx`, `EmployeeDrawer.tsx`)

### Таблиця

- Колонка **Роботодавець** — бейдж за назвою (`hrEmployerTokensFromName`).
- Під іменем — примітка (`notes`), `text-xs truncate`.
- Якщо `hasPayWarning` — іконка `triangle-alert` біля імені (не блокує дії).
- Імпорт `.xlsx` (попередній перегляд + commit).

### Зайнятість і ставки — як читати

Один співробітник може мати **кілька зайнятостей**: різні роботодавці, групи оплати (`HrPayGroup`) або періоди. Це окремі рядки в табелі й розрахунку.

**Ставки (`HrPayTerms`)** — історія сум для однієї зайнятості (погодинна / місячна, період `effectiveFrom`–`effectiveTo`). Нормально мати кілька записів, якщо вони **не перетинаються** в часі (стара ставка закрита, нова чинна).

Одночасно кілька **чинних** ставок в одній зайнятості або кілька **діючих** зайнятостей в одній групі — помилкова ситуація для розрахунку (warning, розрахунок може дублювати або дати 0).

### Drawer картки (`EmployeeDrawer`)

- Ширина `size="3xl"`, основні поля в 2 колонки на десктопі.
- Кожна зайнятість — `Card`: у `CardHeader` період + статус (активна / завершена) і видалення; у `CardBody` — чипи групи/роботодавця, список ставок, форма нової ставки.
- Форми «Додати зайнятість» / «Додати ставку» сховані під спойлер (кнопка відкриває форму, «Зберегти» пише в API).
- Заголовок «Ставка» / «Ставки» залежить від кількості записів.
- Сума ставки: маска `00 000` (пробіл тисяч, без копійок), `endContent` «грн».
- Картка: маска `0000 0000 0000 0000`. Повний номер — лише з `action.hr.payouts.view`.
- ПІБ капіталізуються на blur і перед збереженням (`capitalizeUaName`).
- **Незбережені зміни:** snapshot полів картки (ПІБ, статус, user, картка, примітка) → `isDirty` → `useUnsavedGuard` + `UnsavedChangesModal` при закритті / overlay / Escape / навігації. Зайнятість і ставки пишуться своїми кнопками одразу, у snapshot не входять. Кнопка «Зберегти» неактивна, доки немає змін.

### Нова ставка з перекриттям

Якщо період нової ставки перетинається з наявною (`overlappingPayTerms`):

1. ConfirmModal «Закрити попередню ставку?»
2. Після згоди `POST` з `closePrevious: true` — у транзакції чинним overlapping-записам ставиться `effectiveTo` = день перед `effectiveFrom` нової ставки.

### Попередження ставок (`hrPayHealth`)

Спільна логіка: `shared/utils/hrPayHealth.ts` (тести `hrPayHealth.spec.ts`).

`collectHrPayWarnings` (для активного співробітника):

- немає діючої зайнятості зі ставкою;
- у діючій зайнятості немає чинної ставки;
- кілька чинних ставок в одній зайнятості;
- кілька діючих зайнятостей в одній групі оплати.

Неактивний співробітник без зайнятості — без warning.

Список: `HrEmployeeListItemDto.hasPayWarning`. Drawer показує `Alert` з тими самими текстами.

### API (картка)

| Метод | Шлях | Примітка |
| --- | --- | --- |
| GET | `/api/hr/employees` | елемент списку з `hasPayWarning` |
| POST/PUT | `/api/hr/employees`, `/api/hr/employees/:id` | картка |
| POST | `/api/hr/employees/:id/employments` | нова зайнятість |
| POST | `/api/hr/employments/:id/pay-terms` | тіло `HrPayTermsWritePayload`, опційно `closePrevious` |
| DELETE | `/api/hr/employments/:id`, `/api/hr/pay-terms/:id` | |

---

## Спільні UI-утиліти

`client/pages/Hr/hrUi.tsx`:

- Hue для груп оплати, статусів, типів роботодавців, кодів табеля.
- `HrSpecChip` — бейджі в стилі Products 2.0 / specColorPalette.
- Кнопки `HR_BTN_*` (primary / neutral / warning).

---

## Файли

| Область | Шлях |
| --- | --- |
| Типи | `shared/types/hr.ts` |
| Розрахунок | `server/modules/Hr/payrollCalc.ts` |
| Сервіси | `HrService`, `HrTimesheetService`, `HrPayrollService`, `HrXlsxImportService` |
| Маршрути API | `server/modules/Hr/HrController.ts` |
| Імпорт Excel | `shared/utils/hrXlsxImport.ts` |
| Календар місяця | `shared/utils/hrTimesheetCalendar.ts` |
| Здоровʼя ставок | `shared/utils/hrPayHealth.ts` |
