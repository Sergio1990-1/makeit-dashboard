.PHONY: dev build preview test lint format check clean

dev:  ## Запустить dev-сервер
	npm run dev

build:  ## Собрать проект
	npm run build

preview:  ## Превью билда
	npm run preview

lint:  ## Проверить линтером
	npm run lint

format:  ## Отформатировать код
	npx prettier --write "src/**/*.{ts,tsx,css}"

check:  ## Все проверки
	npm run lint
	npx tsc --noEmit
	npm run build
	@echo "✅ Все проверки пройдены"

clean:  ## Очистить билд
	rm -rf dist node_modules
