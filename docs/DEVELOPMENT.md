# Development

## Установка
```bash
npm install
```

## Запуск
```bash
npm run dev
```

## Проверки
```bash
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript
npm run build         # Build
make check            # Всё вместе
```

## Deploy
CI/CD настроен через GitHub Actions → GitHub Pages.
Push в main автоматически деплоит.

## Конфигурация проектов
Список проектов: `src/utils/config.ts`
Добавить новый проект — добавить запись в массив `PROJECTS`.
