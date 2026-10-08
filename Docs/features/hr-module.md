# HR: табель, розрахунок, співробітники, роботодавці

**Дата:** 2026-09-14 (оновлено: 2026-10-07 — фіз. особи: дерево, статуси, merge, групи Dilovod)  
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
| `action.hr.settings.manage` | admin, boss | HR-налаштування (TableBuilder тощо) |
| `action.hr.employment.transfer` | admin, boss | Перенесення зайнятості |
| `action.hr.employment.change-group` | admin, boss | Зміна групи оплати |
| `action.hr.employment.change-employer` | admin, boss | Зміна роботодавця |
| `action.hr.employment.change-pay-rate` | admin, boss | Зміна ставки в історії зайнятості |

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
- **`HrLegalEntity`** — роботодавець: `code`, `name`, `kind`, `dilovodFirmId?`, `dilovodPersonGroupId?` (папка в `catalogs.persons` під «Працівники», унікальна), `isActive`.
- **`HrEmployment`** — зайнятість: працівник × роботодавець × `payGroupId` × період; `personnelNumber`, `dilovodEmployeeId`, посади.
- **`HrPayGroup`** — довідник груп оплати (`slug`, `label`, `formulaProfile`, `sortOrder`, `chipHue?`); seed: `official_salary`, `hourly`, `hourly_unofficial`, `unofficial_cash`.

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

- Довідник `hr_tax_rules`: ЄСВ (22%), ПДФО (18%), військовий (5%); у seed — лише `official_salary`, у UI можна прив’язати кілька груп (типово **`official_salary`** і **`hourly`**). Поле **`shortLabel`** — короткий заголовок колонки в розрахунку; **`base`**: `gross` («До утримань») або `accrued` («Нараховано») — від чого множиться ставка правила.
- Розрахунок для офіційних груп **`official_salary`** і **`hourly`**: сума з табеля (`accrued`) трактується як «на руки»; `gross = accrued / (1 − Σ ставок ПДФО та ВЗ з активних правил)`, далі ставки застосовуються до `gross` або `accrued` згідно з полем **`base`** кожного правила. `employerTotalCost = gross + податки роботодавця + премія (+ ЄСВ на премію)`. **`esvAmount`** — лише правило з `code === 'esv'`, не всі податки роботодавця. Неофіційні групи: без gross-up (`gross = accrued`), якщо правила не налаштовані.
- API: `GET/POST/PATCH/DELETE /api/hr/tax-rules` — право `action.hr.taxrules.manage`.
- Групи оплати: редагування **`chipHue`** для бейджів (`SpecHueSelect`).

### Виробничий календар

- Опційний (`hr_production_calendar`, за замовч. вимкнено). Пресети: пн–пт, пт–чт, кастом.
- `fopWeekdays` — дні для агрегації фонду оплати праці; табель лишається на календарних тижнях.
- API: `GET/PUT /api/hr/production-calendar`, `GET /api/hr/production-weeks`.
- **Незбережені зміни:** snapshot конфігу в `ProductionCalendarTab`; кнопка «Зберегти» неактивна, доки clean; при перемиканні таба в `Employers/index.tsx` — `useUnsavedGuard` з опцією «Зберегти і вийти».

---

## Премії (`/hr/bonuses`)

- Drawer створення/редагування: `useUnsavedGuard` + `ConfirmModal` для видалення й затвердження.
- Таблиця `hr_bonuses`: привʼязка до **календарного місяця** (`periodYear`, `periodMonth`).
- Статуси: `draft` → `approved` → `locked`. Незатверджені — warning у фонді оплати праці, не блокують calculate.
- Фільтр періоду: **`MonthSwitcher`** (місяць), не робочий тиждень.
- Сума в drawer — money input з форматуванням.
- API: `GET/POST/PATCH/DELETE /api/hr/bonuses?year=&month=`, `GET /api/hr/bonuses/employments`.

---

## Фонд оплати праці (`/hr/fop`)

**UI:** `client/pages/Hr/Fop/index.tsx`

- Зведення `employerTotalCost` (витрати роботодавця) за обраний період — база для майбутньої калькуляції собівартості.
- У UI **не** використовується абревіатура «ФОП», щоб не плутати з типом роботодавця (`kind: fop`). Заголовок сторінки — з `Layout` / `routes.config.tsx` («Фонд оплати праці»), без дубля `h1` у контенті.
- Фільтр періоду — той самий, що в Преміях (`useHrWorkWeekPeriodFilter` + `ReportsFilterBuilder`).
- Картки: `shadow="none"`, `border-border-subtle`; summary по групах — `bg-surface-page`.
- Бейдж джерела: **«Зі знімка розрахунку»** (`source: snapshot`) / **«Попередній перегляд»** (`preview`) — `SpecChip`.
- Таблиця: колонка «Група» — `SpecChip` + `hrPayGroupTokens` (як у `/hr/employees` і `/hr/payroll`).
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

**UI:** `client/pages/Hr/Persons/index.tsx`, дерево — `PersonsTreeTable.tsx`, картка — `PersonCard` / `PersonCardPanel`.

- Незбережені зміни в картці захищені `useUnsavedGuard` (snapshot полів контакту).
- **Дерево папок Dilovod** під root «Працівники»: вкладені групи роботодавців (з `HrPersonGroupSyncService`), системні «Звільнені працівники», окремий root **«Поза групою»** для контактів без відомої папки. Пошук (від 3 символів) зберігає ієрархію предків; chevron і «Згорнути всі» для розкритих гілок.
- **Merge особей:** `PersonMergeModal` — матриця полів (телефон, email, адреса, примітки, роботодавець, група, статус) + radio головного запису в заголовках колонок. Кандидати з `GET /api/hr/persons/:id/duplicates` (як у картці). API: `POST /api/hr/persons/merge-batch` (`targetPersonId`, `sourcePersonIds`, `fieldSelections`).
- Після merge джерела в Dilovod переміщуються в папку **«Дублікати контактів»** (`DILOVOD_PERSON_GROUP_DUPLICATE_CONTACTS`), цільовий контакт — push оновлених даних (`HrPersonSyncService.finalizeMergedPersonSources`).

Окремий довідник від співробітників. У Dilovod у `catalogs.persons` — контрагенти **і папки**; у backoffice дерево будується з локальних `HrPerson` + метаданих груп з Dilovod.

| Константа (`shared/constants/dilovod.ts`) | Призначення |
| --- | --- |
| `DILOVOD_PERSON_GROUP_EMPLOYEES` | Root «Працівники» |
| `DILOVOD_PERSON_GROUP_DISMISSED` | «Звільнені працівники» |
| `DILOVOD_PERSON_GROUP_DUPLICATE_CONTACTS` | Архів обʼєднаних дублікатів |

### Група vs фізособа в Dilovod

Розрізнення в `shared/utils/dilovodPersonGroups.ts` → **`isDilovodPersonGroupRow`**:

1. Системні id папок (див. таблицю вище).
2. **`isGroup: 1`** (або `true` / `'1'`) — головна ознака папки, навіть якщо `personType` = фізособа.
3. **`isGroup: 0`** — завжди контакт, не папка.
4. Якщо `isGroup` у відповіді API немає — застарілі евристики (`personType`, відсутність ІПН/телефону).

**Синк і дерево не показують папку як особу:**

- `pullSelective` / `upsertFromDilovod` пропускають рядки з `isDilovodPersonGroupRow`.
- `getPersonsByIds` (привʼязані співробітники, `catalogs.employees`) — те саме.
- `getTree` не додає `HrPerson`, якщо `dilovodPersonId` збігається з відомим id групи.
- При pull помилкові `HrPerson` з id папки архівуються (`localStatus: archived`).

### Статус працівника в UI (не `HrEmployee.status`)

Відображення: `PersonEmploymentStatusChip` + `shared/utils/hrPersonEmploymentStatus.ts` → **`resolvePersonEmploymentDisplayStatus`**.

| Статус UI | Умова |
| --- | --- |
| **Звільнений** | Контакт у папці звільнених (`dilovodParentId` або назва групи) — **пріоритет над усім іншим** |
| **Активний** | Є `linkedEmployee`, `status === active`, відкрита зайнятість / роботодавець |
| **Без зайнятості** | `linkedEmployee.status === active`, але немає поточного роботодавця |
| **Неактивний** | `linkedEmployee.status === inactive`, не в папці звільнених |
| **—** | Немає `linkedEmployee` |

Сирий **`HrEmployee.status`** (`active` / `inactive`) змінюється в `EmployeeDrawer` (switch), при архіві співробітника, при **`POST /api/hr/persons/:id/dismiss`** (звільнення: папка Dilovod + `inactive` + закриття зайнятостей). Окремого UI для inactive фізособи немає.

**Конфлікт:** контакт у папці звільнених, але в HR ще є `linkedEmployee` — червоний індикатор `PersonDismissedStatusConflictIndicator` (дерево, tooltip про конфлікт статусів).

### API (додатково)

| Метод | Шлях | Призначення |
| --- | --- | --- |
| GET | `/api/hr/persons/tree` | Дерево для UI (`search`, `duplicatesOnly`) |
| POST | `/api/hr/persons/merge-batch` | Обʼєднання з вибором полів |
| POST | `/api/hr/persons/:id/dismiss` | Звільнення (`dismissedAt`) |
| POST | `/api/hr/persons/sync/pull` | Вибірковий pull (`HrPersonSyncService.pullSelective`) |
| POST | `/api/hr/persons/:id/sync/push` | Push контакту в Dilovod |
| POST | `/api/hr/persons/:id/move-to-employees-group` | Переміщення в групу працівників |

**Утиліти merge полів:** `shared/utils/personMergeFields.ts`.  
**Дублікати:** `shared/utils/hrPersonDuplicate.ts`, бейдж у дереві — `DuplicateIndicator` у `PersonsTreeTable.tsx`.

### Папки роботодавців (`HrPersonGroupSyncService`)

Сервіс: `server/modules/Hr/HrPersonGroupSyncService.ts`. У дереві `/hr/persons` кожен роботодавець з `dilovodPersonGroupId` — вкладена папка під root «Працівники».

| Метод | Шлях | Дія |
| --- | --- | --- |
| POST | `/api/hr/legal-entities/:id/sync/person-group` | Створити папку в Dilovod за назвою роботодавця або **виправити** запис без `isGroup` (`person_group_repaired` в audit) |
| POST | `/api/hr/persons/sync/pull/groups` | Зіставити існуючі папки Dilovod з `HrLegalEntity` за назвою → заповнити `dilovodPersonGroupId` |
| DELETE | `/api/hr/legal-entities/:id/person-group` | Видалити **порожню** папку в Dilovod (`delMark`) і скинути звʼязок; умови: немає контактів у backoffice з `dilovodParentId`, немає дітей у Dilovod |
| DELETE | `.../person-group?localOnly=1` | Лише скинути `dilovodPersonGroupId`, якщо папку в Dilovod уже видалили вручну (код `PERSON_GROUP_MISSING_IN_DILOVOD` → confirm у UI) |

**UI:** контекстне меню групи (sync папки), кнопка видалення порожньої папки в `PersonsTreeTable` (`MiniConfirmPopover`). Після будь-якого sync/move/merge — `fetchTree({ refreshFullTree: true })`.

**Dilovod API:** при `saveObject` для контактів і папок `catalogs.persons` не передавати `header.version` (читання `version` у `request` лишається); оновлення груп — `updatePersonGroup` з `isGroup: 1`.

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
4. Масові дії по дню — **контекстне меню** на заголовку колонки дати (`TimesheetDayHeaderContextMenu`)

### Фільтри груп

`PageTabs` (secondary) **над таблицею**: Усі / Офіційна ставка / Погодинні / Нештатні. Стан у query `?group=`.

### Таблиця (`TimesheetGrid`)

- Sticky header (патерн з `HierarchicalReportTable`).
- Згортання правого сайдбару підсумків (за замовч. згорнутий; лише колонка «год»).
- Кольорові заголовки груп (`hrPayGroupTokens`).
- Редагування: цифра — години, літера — код; F2 / подвійний клік / контекстне меню — години.
- Нумерація рядків (`RowIndexCell`).
- Легенда кодів дня з налаштуванням hue (`TimesheetKindLegend`, `useHrTimesheetKindColors`).
- **Заповнити / очистити вихідні** — контекстне меню на заголовку колонки суботи/неділі (`TimesheetDayHeaderContextMenu`). Напівпрозоре «В» — UI-підказка (prefill), не запис у БД.
- При **дублях зайнятості** (один співробітник × група оплати, кілька роботодавців) записи табеля зіставляються з канонічним рядком (`dedupeEmploymentsByEmployeePayGroup`). Збереження очищення вихідних застосовується до всіх id групи — інакше «В» на дублікаті повертається після reload.

### API

- `GET /api/hr/timesheet?month=YYYY-MM`
- `PUT /api/hr/timesheet/:id` — optimistic locking через `version`

---

## Розрахунок (`/hr/payroll`)

**UI:** `client/pages/Hr/HrPayrollPage.tsx`, `client/pages/Hr/Payroll/*`

### Toolbar (як у табелі)

1. Пошук за ПІБ  
2. Перемикач місяця  
3. **Режим періоду:** «По виробничих тижнях» / «За місяць» / «Довільний період»  
4. Статус (попередній перегляд / знімок / заблоковано), «До табеля», «Розрахувати», «Заблокувати», **TableBuilder** (колонки)

### Режими періоду (`periodMode`)

| Режим | Колонки | Примітка |
| --- | --- | --- |
| `production` | Виробничі тижні з `hr_production_calendar` | Номер тижня + діапазон дат; на межі місяців підвантажуються записи сусідніх табелів |
| `month` | Календарні тижні всередині місяця (як табель) | |
| `custom` | ЗП / Податки / Премії / Разом | Діапазон до 31 дня; пропорційні премії |

Місячний підсумок (нарахування, податки) — **лише дні поточного місяця**. Тижневі колонки в режимі `production` показують **повний виробничий тиждень** (усі 7 днів), щоб збігатися з виробничим циклом.

### Знімки по режимах (`periodKey`)

Один календарний місяць може мати **окремі знімки** для кожного режиму (`hr_payroll_periods.periodKey`):

| `periodKey` | Режим UI |
| --- | --- |
| `production` | По виробничих тижнях |
| `month` | По місяцях |
| `custom:YYYY-MM-DD:YYYY-MM-DD` | Довільний період |

«Розрахувати» зберігає знімок лише для **поточного** режиму. Перемикання режиму в селекті завантажує відповідний знімок (або preview, якщо для цього режиму ще не рахували). Виплати (`hr_payouts`) прив’язані до `periodId` конкретного режиму.

### Формула розрахунку

- Офіційна ставка: `accrued = rate × workHours / normHours`; офіційна погодинна: `rate × workHours`.
- Gross-up для податків: `accrued / (1 − Σ withholdingRates)` для **`official_salary`** і **`hourly`** за активними `hr_tax_rules` (коди утримань з працівника — зазвичай `pdfo`, `military`). Реалізація: `payGroupAccruedIsNetToEmployee` у `server/modules/Hr/payrollCalc.ts`.
- Застарілий UI «Формула Tabell 2026» (коефіцієнти 0.23 / 0.77) **видалено**; знімок у БД лишається сумісним (`extraRate: 0`, `grossDivisor: 1`).

### Фільтри груп

`PageTabs` над таблицею — той самий набір, що в табелі. Query `?month=&group=` синхронізується між сторінками.

### Таблиця (`PayrollTable`)

- Темна sticky-шапка, кольорові рядки-групи, **нумерація рядків**.
- Бейдж роботодавця за **конкретною назвою** (`legalEntityName`).
- Опційні колонки податків (`taxesSeparate`): ПДФО+ВЗ, ЄСВ, премія, разом — логіка в `payrollTableColumns.ts`.
- Клік по рядку — drawer з деталями, тижнями (години + сума) і виплатами.
- Налаштування колонок — **`TableBuilder`** + `useHrSettings` (`GET/PUT /api/settings/hr`).

### API

- `GET /api/hr/payroll?month=YYYY-MM&periodMode=&dateFrom=&dateTo=`
- `POST /api/hr/payroll/calculate` — тіло з `periodMode`, `dateFrom`, `dateTo`
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
- **Перенесення:** `POST /api/hr/employments/:id/transfer` — перенос записів табеля/payroll на іншу зайнятість, видалення джерела (`EmploymentTransferModal`, право `action.hr.employment.transfer`).
- **Зміна групи / роботодавця** — окремі дії з правами `change-group`, `change-employer`.
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
- `SpecChip` — бейджі в стилі Products 2.0 / specColorPalette.
- Кнопки `HR_BTN_*` (primary / neutral / warning).

**Cross-domain person-card** (`client/components/person-card/`): контактні поля, `PersonCard`, `UserCard`. HR-специфіка в `client/components/hr/` (accordion дублікатів, audit, status chip).

**Форматування грошей:** `formatMoney()` у `client/lib/formatUtils.ts` (HR: премії, фонд оплати праці, drawer розрахунку).

---

## Файли

| Область | Шлях |
| --- | --- |
| Типи | `shared/types/hr.ts` |
| Розрахунок | `server/modules/Hr/payrollCalc.ts`, `payrollTableColumns.ts` |
| HR settings | `server/modules/Hr/HrSettingsService.ts`, `shared/types/hrSettings.ts` |
| TableBuilder | `client/components/table/TableBuilder.tsx`, `shared/types/tableBuilder.ts` |
| Сервіси | `HrService`, `HrTimesheetService`, `HrPayrollService`, `HrPersonService`, `HrPersonSyncService`, `HrDilovodSyncService`, `HrAuditService`, `HrPayGroupService`, `HrSettingsService` |
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
