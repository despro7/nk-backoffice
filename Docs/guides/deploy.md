# Деплой на прод (`npm run deploy`)

Один локальний запуск замість ручного «ssh → sudo -i → cd → git pull → build → pm2 reload».

```bash
npm run deploy              # з питанням «Deploy this commit? [y/N]»
npm run deploy -- --yes     # без питання
npm run deploy -- --migrate # додатково `prisma migrate deploy`, якщо в pull є нові міграції
```

## Що робить `scripts/deploy.sh`

1. **Локальні перевірки:** гілка `master`, робоче дерево чисте, локальний HEAD = `origin/master` (інакше спершу push).
2. **Вхід:** `ssh -t netcup`, далі `sudo -i`. Пароль sudo вводиться в тому ж терміналі (скрипт його не зберігає й не передає).
3. **На сервері** (`/home/backoffice.nk-food.shop/app`):
   - `git pull --ff-only` і список нових комітів;
   - `npm ci`, лише якщо змінився `package-lock.json`;
   - нові `prisma/migrations/`: без `--migrate` лише попередження, з `--migrate` виконується `npm run db:migrate:prod`;
   - `npm run build:prod`, `pm2 reload all`, `pm2 status`;
   - health check `http://127.0.0.1:3001/api/health` (до 10 спроб по 3 с); при збої показує останні помилки pm2 і завершується з кодом 1.
4. **Результат:** `DEPLOY OK in Ns` або `DEPLOY FAILED: ...` з ненульовим кодом виходу.

## Змінні оточення (необовʼязково)

`DEPLOY_SSH_HOST` (типово `netcup`), `DEPLOY_APP_DIR`, `DEPLOY_BRANCH` (`master`), `DEPLOY_HEALTH_URL`.

## Нотатки

- Під `sudo -i` node/npm/pm2 не в PATH (nvm завантажується лише в інтерактивній оболонці), тому скрипт підтягує `$HOME/.nvm/nvm.sh` і перевіряє наявність `npm` і `pm2` до початку.
- Міграції навмисно не застосовуються автоматично: деякі потребують дампу таблиці перед запуском.
- Пароль sudo вводить користувач. Без пароля можливо лише через окреме правило sudoers на сервері (рішення про безпеку сервера, у скрипті не передбачено).
