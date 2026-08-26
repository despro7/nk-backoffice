# Timeline — індикатор кроків

**Дата:** 2026-08-26  
**Файл:** `client/components/Timeline.tsx`

Горизонтальний індикатор кроків (чекпоінти + конектори + підписи). Винесений зі сторінок імпорту, щоб підключати з різними кольорами й розмірами на моб/десктоп.

## Пропси

| Проп | Призначення |
|---|---|
| `steps` | `{ key, label, icon }` |
| `currentKey` | Активний крок |
| `color` | Пресет: `amber` \| `sky` \| `primary` \| `success` \| `green` \| `purple` \| `pink` |
| `mobile` / `desktop` | `TimelineMetrics`: `iconSize`, `iconPadding`, `fontSize`, `gap`, `connectorMinWidth` / `MaxWidth`, `labelOffset` |
| `iconStyle` | Перевизначити розмір/padding/кольори кіл поверх пресета |
| `className` / `wrapperClassName` | Обгортка |

Breakpoints: metrics `mobile` до `md`, далі `desktop`.

## Де використовується

- Імпорт реєстру переказів НП — `amber`
- Банківські виписки — `sky`
