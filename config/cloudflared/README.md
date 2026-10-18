# Cloudflare named tunnel – Chatwoot dev webhook

Стабільний URL для Agent Bot:

`https://chatwoot-dev.nk-food.shop/api/webhooks/chatwoot`

## Одноразове налаштування

```bash
cloudflared tunnel login
cloudflared tunnel create nk-chatwoot-dev
cp config/cloudflared/chatwoot-dev.yml.example config/cloudflared/chatwoot-dev.yml
# Відредагуй credentials-file у chatwoot-dev.yml
```

### DNS: A чи CNAME?

**Не A-запис на IP VPS.** Тунель підключається **з твого Mac** до Cloudflare, не через сервер nk-food.

| Де DNS для `nk-food.shop` | Що зробити |
|---------------------------|------------|
| **Cloudflare** (рекомендовано) | `cloudflared tunnel route dns nk-chatwoot-dev chatwoot-dev.nk-food.shop` |
| **Лише CyberPanel** | Субдомен `chatwoot-dev` → тип **CNAME** → `<TUNNEL-UUID>.cfargotunnel.com` (UUID з `cloudflared tunnel list` або ім’я файлу credentials) |

У CyberPanel: **Websites → DNS** (або Zone Editor) – додати запис CNAME, не створювати окремий сайт/vhost для цього імені (трафік обслуговує Cloudflare tunnel).

## Щоденний запуск

**Локальні webhook з Chatwoot (Outgoing URL = chatwoot-dev):**

```bash
npm run dev:chatwoot
```

(SSH-тунель до БД + Vite `:8080` + `cloudflared` в одній команді.)

Або вручну в двох терміналах: `npm run dev` і `npm run dev:cloudflared`.

**Важливо:** одночасно має бути **лише один** активний `cloudflared` для `nk-chatwoot-dev`. Якщо тунель запущений і на Mac, і на VPS – Chatwoot буде чергувати webhook між двома backoffice (у журналі з’являться `handover_failed` з HTML 400 без `trace=` / `build=`).

Health: `curl -s https://chatwoot-dev.nk-food.shop/api/webhooks/chatwoot/health`
