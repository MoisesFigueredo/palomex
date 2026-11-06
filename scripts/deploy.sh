#!/usr/bin/env bash
# Publica na conta pessoal da Vercel (nunca no time Novx): só o jogo pronto e a API.
set -e
cd "$(dirname "$0")/.."
npx vite build
mkdir -p .deploy/palomex/api
cp dist/index.html .deploy/palomex/index.html
cp api/rank.js .deploy/palomex/api/rank.js
cat > .deploy/palomex/package.json <<'JSON'
{
  "private": true,
  "type": "module",
  "dependencies": { "@neondatabase/serverless": "^1.2.0" }
}
JSON
cd .deploy/palomex
vercel deploy --prod --yes --scope moisesfigueredos-projects
