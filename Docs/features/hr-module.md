# HR: табель, розрахунок, співробітники, роботодавці

**Дата:** 2026-09-14 (оновлено: HR UX Фаза 2+, фонд оплати праці, dedupe табеля)  
**Маршрути:** `/hr/timesheet`, `/hr/payroll`, `/hr/employees`, `/hr/employers`, `/hr/persons`, `/hr/bonuses`, `/hr/fop`  
**API:** `/api/hr/*`  
**Модуль сервера:** `server/modules/Hr/`  
**План:** [`Docs/plans/hr-dilovod-alignment.md`](../plans/hr-dilovod-alignment.md)

---

## Огляд

Внутрішній облік робочих годин і виплат. Це **не** податковий облік. Модель **гібридна**: табель, групи оплати й внутрішні виплати — локальний master; кадрові довідники Dilovod синхронізуються вибірково.

| Розділ | Призначення |
| --- | --- |
| **Табель** | Введення годин і кодів дня по місяцях |
| **Розрахунок** | Знімок виплат за табелем, фіксація виплат |
| **Співробітники** | Каталог працівників, зайнятість, ставки, накази (read-only) |
| **Фіз. особи** | Довідник `catalogs.persons` (група «Працівники»), sync з Dilovod |
| **Роботодавці** | Юрособи / ФОП, типи, групи оплати |

Каталог співробітників **не** змішується з обліковими `User` — привʼязка `userId` опційна.  
Звʼязок із фіз. особою (`personId`) — **опційний**, див. розділ нижче.

---

## Права доступу

Ключі в `shared/constants/permissions.ts`:

| Ключ | Seed | Опис |
| --- | --- | --- |
| `page.hr.timesheet` | boss+ | Табель |
| `page.hr.payroll` | admin, boss | Розрахунок |
| `page.hr.employees` | boss+ | Співробітники і роботодавці |
| `page.hr.persons` | boss+ | Фізичні особи |
| `action.hr.timesheet.edit` | boss+ | Редагування табеля |
| `action.hr.employees.manage` | boss+ | CRUD співробітників і роботодавців |
| `action.hr.persons.manage` | boss+ | CRUD фіз. осіб, sync, merge |
| `action.hr.audit.view` | boss+ | Журнал змін HR (картка, табель) |
| `action.hr.payroll.view` | admin, boss | Розрахунок / блокування / виплати |
| `action.hr.payterms.manage` | boss+ | Ставки |
| `action.hr.payouts.view` | admin, boss | Повний номер картки |

---

## Модель даних (Prisma)

```
HrPerson ◄── HrEmployee ──► HrEmployment ◄── HrLegalEntity
                │                │
                │                ├── HrPayGroup (FK payGroupId)
                │                ├── HrPayTerms
                │                ├── HrTimesheetEntry
                │                ├── HrPayrollLine
                │                ├── HrPayout
                │                └── HrStaffOrder (read-only cache)
                └── User? (опційно)

HrAuditLog — журнал дій користувача (окремо від meta_logs)
```

- **`HrPerson`** — фіз. особа (`catalogs.persons`): ПІБ, ІПН, телефон, `dilovodPersonId`, `dilovodParentId` (група в Dilovod), `localStatus`.
- **`HrEmployee`** — працівник табеля: ПІБ, `personId?`, `userId?`, картка для виплат.
- **`HrLegalEntity`** — роботодавець: `code`, `name`, `kind`, `dilovodFirmId?`, `isActive`.
- **`HrEmployment`** — зайнятість: працівник × роботодавець × `payGroupId` × період; `personnelNumber`, `dilovodEmployeeId`, посади.
- **`HrPayGroup`** — довідник груп оплати (`slug`, `label`, `formulaProfile`, `sortOrder`); seed: `official_salary`, `hourly`, `unofficial_cash`.

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
- Деактивувати **останнього** активного роботодавця певного типу неможливо (потрібен хоча б один запис кожного типу для табеля й розрахунку).
- У seed-записів (`fop`, `tov`, `unofficial_cash`) тип при редагуванні заблокований; назву змінити можна.

**API:**

| Метод | Шлях | Право |
| --- | --- | --- |
| GET | `/api/hr/legal-entities` | `page.hr.employees` |
| GET | `/api/hr/legal-entities?includeInactive=true` | те саме, повний список |
| POST | `/api/hr/legal-entities` | `action.hr.employees.manage` |
| PUT | `/api/hr/legal-entities/:id` | `action.hr.employees.manage` |

Тіло: `{ name, kind, isActive? }` — тип `HrLegalEntityWritePayload` у `shared/types/hr.ts`.

**Таби:** Роботодавці | Типи | Групи оплати | **Податки та ЄСВ** | **Виробничий календар**.  
**Sync firms:** `POST /api/hr/sync/firms` — `dilovodFirmId` з `catalogs.firms`.

### Податки та ЄСВ

- Довідник `hr_tax_rules`: ЄСВ (22%), ПДФО (18%), військовий (5%) для `official_salary`.
- Розрахунок: `gross = accrued / (1 - pdfo - military)`, `employerTotalCost = gross + ЄСВ + премія (+ ЄСВ на премію)`.
- API: `GET/POST/PATCH/DELETE /api/hr/tax-rules` — право `action.hr.taxrules.manage`.

### Виробничий календар

- Опційний (`hr_production_calendar`, за замовч. вимкнено). Пресети: пн–пт, пт–чт, кастом.
- `fopWeekdays` — дні для агрегації фонду оплати праці; табель лишається на календарних тижнях.
- API: `GET/PUT /api/hr/production-calendar`, `GET /api/hr/production-weeks`.
- **Незбережені зміни:** snapshot конфігу в `ProductionCalendarTab`; кнопка «Зберегти» неактивна, доки clean; при перемиканні таба в `Employers/index.tsx` — `useUnsavedGuard` з опцією «Зберегти і вийти».

---

## Премії (`/hr/bonuses`)

- Drawer створення/редагування: `useUnsavedGuard` + `ConfirmModal` для видалення й затвердження.
- Таблиця `hr_bonuses`: привʼязка до `productionWeekId` або `calendarWeekId`.
- Статуси: `draft` → `approved` → `locked`. Незатверджені — warning у фонді оплати праці, не блокують calculate.
- Фільтр періоду: робочий тиждень (пн–пт) + діапазон дат — через спільний хук `useHrWorkWeekPeriodFilter`.
- API: `GET/POST/PATCH/DELETE /api/hr/bonuses?dateFrom=&dateTo=`, `GET /api/hr/bonuses/employments`.

---

## Фонд оплати праці (`/hr/fop`)

**UI:** `client/pages/Hr/Fop/index.tsx`

- Зведення `employerTotalCost` (витрати роботодавця) за обраний період — база для майбутньої калькуляції собівартості.
- У UI **не** використовується абревіатура «ФОП», щоб не плутати з типом роботодавця (`kind: fop`). Заголовок сторінки — з `Layout` / `routes.config.tsx` («Фонд оплати праці»), без дубля `h1` у контенті.
- Фільтр періоду — той самий, що в Преміях (`useHrWorkWeekPeriodFilter` + `ReportsFilterBuilder`).
- Картки: `shadow="none"`, `border-border-subtle`; summary по групах — `bg-surface-page`.
- Бейдж джерела: **«Зі знімка розрахунку»** (`source: snapshot`) / **«Попередній перегляд»** (`preview`) — `HrSpecChip`.
- Таблиця: колонка «Група» — `HrSpecChip` + `hrPayGroupTokens` (як у `/hr/employees` і `/hr/payroll`).
- Попередження (`summary.warnings`) — жовтий блок над таблицею (draft-премії, незаблокований payroll, відсутність годин у табелі).
- Помилка API (`GET /api/hr/fop`) — toast з текстом від сервера.

### Розрахунок

- Джерело сум: `hrPayrollService.loadMonth()` — snapshot при locked payroll, інакше preview з табеля; премії — лише `approved` / `locked` за тиждень.
- Записи табеля зіставляються з рядками payroll через `dedupeEmploymentsByEmployeePayGroup` + `remapEmploymentId` (`shared/utils/hrEmploymentDedupe.ts`) — інакше при дублях зайнятостей години не потрапляють у рядок і суми = 0.
- Пропорція за період: `aggregateFopFromTimesheet` у `shared/utils/hrProductionWeek.ts` (дні з `fopWeekdays`, години > 0).

### API

- `GET /api/hr/fop?dateFrom=&dateTo=` — основний спосіб (з UI);
- `GET /api/hr/fop?periodId=&periodKind=` — legacy;
- `GET /api/hr/fop/periods?month=` — періоди для drawer премій (виробничий календар або календарні тижні табеля).

### Чому суми можуть бути 0

| Перевірка | Дія |
| --- | --- |
| Табель порожній за обрані дати | Заповнити години в `/hr/timesheet` за дні з `fopWeekdays` |
| Payroll не розраховано | `/hr/payroll` → «Розрахувати» за відповідний місяць |
| Немає ставок / зайнятостей | Картка співробітника → зайнятість + ставка |
| Премії в `draft` | Затвердити в `/hr/bonuses` (draft не входять у суму; є warning) |
| Виробничий календар | `/hr/employers` → «Виробничий календар»: `fopWeekdays` визначають, які дні тижня враховуються |
| Діапазон дат | Розширити період або обрати пресет робочого тижня, де є години |

Якщо рядки payroll є, але `includedDays = 0` по всіх — API повертає warning про відсутність годин у табелі.

### Спільні утиліти періоду

| Шлях | Призначення |
| --- | --- |
| `shared/utils/hrWorkWeekPeriods.ts` | Робочі тижні пн–пт, label, зіставлення пресету |
| `client/pages/Hr/shared/useHrWorkWeekPeriodFilter.ts` | React-хук + `filters` для `ReportsFilterBuilder` |

**Кольори бейджів:** `hrPayGroupTokens`, `hrLegalEntityKindTokens(kind)` / `hrEmployerTokensFromName(name)` у `client/pages/Hr/hrUi.tsx`.

---

## Фізичні особи (`/hr/persons`)

**UI:** `client/pages/Hr/Persons/index.tsx`, картка — `PersonCard` / `PersonDrawer`.

- Незбережені зміни в картці захищені `useUnsavedGuard` (snapshot полів контакту).
- **Merge особей:** спільний `PersonMergeModal` — у списку (select: джерело → ціль) і в картці при дублікатах (radio: головний запис).

Окремий довідник від співробітників. У Dilovod у `catalogs.persons` — усі контрагенти; у backoffice за замовчуванням показуємо групу **«Працівники»** (`DILOVOD_PERSON_GROUP_EMPLOYEES` у `shared/constants/dilovod.ts`).

| Фільтр | Що показує |
| --- | --- |
| Працівники | `dilovodParentId` = група «Працівники» |
| Поза групою | Особи, привʼязані до HR (`HrEmployee`), але в іншій групі Dilovod |
| Дублікати | `localStatus = duplicate_candidate` (за ІПН / телефоном) |

**Sync:** вибірковий pull — не весь `catalogs.persons`, а лише вже привʼязані + група «Працівники» (`HrPersonSyncService.pullSelective`).  
**API:** `POST /api/hr/persons/sync/pull`, push — `POST /api/hr/persons/:id/sync/push`, переміщення в групу — `POST /api/hr/persons/:id/move-to-employees-group`.

---

## Співробітник ↔ фіз. особа

### Як це задумано

```
catalogs.persons (HrPerson)     catalogs.employees (Dilovod)
        │                                │
        │    HrEmployee.personId         │    HrEmployment.dilovodEmployeeId
        └──────────► HrEmployee ◄────────┴──────► HrEmployment
```

- **`HrPerson`** — біографічні дані однієї людини (ПІБ, ІПН, телефон, email).
- **`HrEmployee`** — запис у **табелі**; може мати `personId` → одна фіз. особа на одного співробітника.
- **`HrEmployment`** — «відомості» в Dilovod: людина × роботодавець; `dilovodEmployeeId` → `catalogs.employees`, `personnelNumber` → табельний №.

У Dilovod ланцюжок: `firms` → `employees` (person + firm) → накази. У нас табель і payroll живуть на `HrEmployment`, не на `HrPerson`.

### Поточний стан (після міграції)

| Що | Статус |
| --- | --- |
| Поле `HrEmployee.personId` в БД | Є (FK на `hr_persons`) |
| API create/update employee з `personId` | Є (`assertPersonAvailable` — одна особа на одного співробітника) |
| UI привʼязки в `EmployeeDrawer` | **Ще немає** |
| Auto-link існуючих співробітників | **Ще немає** (усі `personId` = `null`, якщо не задано вручну через API) |
| Pull persons з Dilovod | Працює на `/hr/persons` → «Синхронізувати» |
| Pull `catalogs.employees` → `personId` | **Частково** — лише `personnelNumber` за `dilovodEmployeeId`, без звʼязку person |

**Висновок:** співробітники й фіз. особи **поки не повʼязані автоматично**. Це два паралельні довідники; звʼязок треба встановити вручну (коли зʼявиться UI) або скриптом auto-link.

### Наступні кроки

Див. [`Docs/plans/hr-dilovod-alignment.md`](../plans/hr-dilovod-alignment.md):

1. Select «Фіз. особа» в `EmployeeDrawer` + збереження `personId`.
2. Скрипт зіставлення за ПІБ / ІПН / телефоном.
3. Розширений sync `catalogs.employees` — `person` → `HrEmployee.personId`, створення `dilovodEmployeeId`.
4. Push табельного № (двосторонній sync з UI warning при конфлікті).

---

## Журнал змін HR (`HrAuditLog`)

Окрема таблиця `hr_audit_log` (аналог `orders_history`), **не** `meta_logs`.

| Де в UI | Що показує |
| --- | --- |
| `EmployeeDrawer` → «Історія змін» | Дії з карткою, зайнятостями, merge |
| `PersonCard` → «Історія змін» | CRUD фіз. особи, merge, sync |
| Контекстне меню табеля → «Логи змін» | Зміни комірки (`cell_changed`) |

Форматування: `shared/utils/hrAuditFormat.ts`.  
Рендер списку: `client/pages/Hr/components/HrAuditLogEntry.tsx`.  
Accordion у картках: `client/components/hr/HrAuditAccordion.tsx`.  
Логи сортуються хронологічно (нові знизу). Permission: `action.hr.audit.view`.

---

## Табель (`/hr/timesheet`)

**UI:** `client/pages/Hr/HrTimesheetPage.tsx`, `client/pages/Hr/Timesheet/*`

### Workflow введення даних

Табель заповнюється **вручну в сітці** (`/hr/timesheet`). Excel-імпорт видалено свідомо — єдине джерело правди для годин і кодів дня — UI табеля та API `PUT /api/hr/timesheet/:id`.

Типовий цикл:

1. **Співробітники** — створити картку, додати зайнятість і ставку.
2. **Табель** — ввести години (цифра) або коди дня (літера); «Заповнити вихідні» для масового заповнення.
3. **Розрахунок** — «Розрахувати» за місяць, переглянути рядки, зафіксувати виплати.
4. **Премії / Фонд оплати праці** — за потреби, після затверджених годин.

Зміни табеля зберігаються кнопкою «Зберегти»; незбережені комірки захищені `useUnsavedGuard` на сторінці табеля.

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

### Зайнятість і ставки — як читати

Один співробітник може мати **кілька зайнятостей**: різні роботодавці, групи оплати (`HrPayGroup`) або періоди. Це окремі рядки в табелі й розрахунку.

**Ставки (`HrPayTerms`)** — історія сум для однієї зайнятості (погодинна / місячна, період `effectiveFrom`–`effectiveTo`). Нормально мати кілька записів, якщо вони **не перетинаються** в часі (стара ставка закрита, нова чинна).

Одночасно кілька **чинних** ставок в одній зайнятості або кілька **діючих** зайнятостей в одній групі — помилкова ситуація для розрахунку (warning, розрахунок може дублювати або дати 0).

### Drawer картки (`EmployeeDrawer`)

- Вкладки: **Працівник** | **Зайнятості** | **Накази** (read-only з `hr_staff_orders`).
- Accordion **«Історія змін»** — `HrAuditAccordion` (`client/components/hr/`).
- Ширина `size="3xl"`, основні поля в 2 колонки на десктопі.
- Кожна зайнятість — `Card`: у `CardHeader` період + статус (активна / завершена); кнопка **«Обʼєднати»** лише якщо є кілька активних зайнятостей в одній групі оплати.
- Merge: `POST /api/hr/employments/:id/merge` — перенос табеля, ставок, payroll; видалення дублів ставок; audit `employment_merged`.
- Форми «Додати зайнятість» / «Додати ставку» сховані під спойлер (кнопка відкриває форму, «Зберегти» пише в API).
- Заголовок «Ставка» / «Ставки» залежить від кількості записів.
- Сума ставки: маска `00 000` (пробіл тисяч, без копійок), `endContent` «грн».
- Картка: маска `0000 0000 0000 0000`. Повний номер — лише з `action.hr.payouts.view`.
- ПІБ капіталізуються на blur і перед збереженням (`capitalizeUaName`).
- **Незбережені зміни:** snapshot полів картки (ПІБ, статус, user, картка, примітка) → `isDirty` → `useUnsavedGuard` + `UnsavedChangesModal` при закритті / overlay / Escape / навігації. Додатково `isDirty`, якщо відкрита форма «Додати зайнятість» або незбережена форма ставки в `EmploymentBlock`. Кнопка «Зберегти» неактивна, доки немає змін.
- **Створення облікового запису:** кнопка `[+]` біля Select «Обліковий запис (опційно)» (при `action.hr.employees.manage` + `action.users.manage`, якщо `userId` ще не привʼязано). Відкриває вкладений `CreateUserDrawer` з імʼям «Прізвище Імʼя» (без по батькові). Після `POST /api/auth/register` — автоматично встановлює `userId` і оновлює список доступних користувачів.

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
| POST/PUT | `/api/hr/employees`, `/api/hr/employees/:id` | картка; `personId` опційно |
| POST | `/api/hr/employees/:id/employments` | нова зайнятість |
| POST | `/api/hr/employments/:id/merge` | обʼєднання з `{ targetEmploymentId }` |
| POST | `/api/hr/employments/:id/pay-terms` | тіло `HrPayTermsWritePayload`, опційно `closePrevious` |
| DELETE | `/api/hr/employments/:id`, `/api/hr/pay-terms/:id` | |
| GET | `/api/hr/audit` | журнал (`entityType`, `entityId`, `employmentId`+`date` для табеля) |

---

## Спільні UI-утиліти

`client/pages/Hr/hrUi.tsx`:

- Hue для груп оплати, статусів, типів роботодавців, кодів табеля.
- `HrSpecChip` — бейджі в стилі Products 2.0 / specColorPalette.
- Кнопки `HR_BTN_*` (primary / neutral / warning).

**Cross-domain person-card** (`client/components/person-card/`): контактні поля, `PersonCard`, `UserCard`. HR-специфіка в `client/components/hr/` (accordion дублікатів, audit, status chip).

**Форматування грошей:** `formatMoney()` у `client/lib/formatUtils.ts` (HR: премії, фонд оплати праці, drawer розрахунку).

---

## Файли

| Область | Шлях |
| --- | --- |
| Типи | `shared/types/hr.ts` |
| Розрахунок | `server/modules/Hr/payrollCalc.ts` |
| Сервіси | `HrService`, `HrTimesheetService`, `HrPayrollService`, `HrPersonService`, `HrPersonSyncService`, `HrDilovodSyncService`, `HrAuditService`, `HrPayGroupService` |
| Маршрути API | `server/modules/Hr/HrController.ts` |
| Audit формат | `shared/utils/hrAuditFormat.ts` |
| Календар місяця | `shared/utils/hrTimesheetCalendar.ts` |
| Робочі тижні (фільтр) | `shared/utils/hrWorkWeekPeriods.ts`, `client/pages/Hr/shared/useHrWorkWeekPeriodFilter.ts` |
| Фонд оплати праці | `server/modules/Hr/HrFopService.ts`, `client/pages/Hr/Fop/index.tsx` |
| Виробничий період / агрегація | `shared/utils/hrProductionWeek.ts` |
| Здоровʼя ставок | `shared/utils/hrPayHealth.ts` |
| Merge зайнятостей | `server/modules/Hr/HrEmploymentMerge.ts` |
| Merge UI особей | `client/pages/Hr/components/PersonMergeModal.tsx` |
| HR accordion/chip | `client/components/hr/` |
| Скрипт дублів | `scripts/hr-audit-employment-duplicates.ts` |
| Тести HR (merge, bonus, fop) | `server/modules/Hr/*.spec.ts` |
