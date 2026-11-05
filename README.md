# Palomex

Runner 3D de navegador para PC e celular: o gnomo Tonho foge do Cramunhão do Brejo pela floresta à noite.

Jogue em https://palomex.vercel.app

## Controles

| Ação | PC | Celular |
|---|---|---|
| Mudar de pista | Setas ou A/D | Botões ◀ ▶ ou deslizar |
| Pular | Seta para cima ou W | Botão pula ou deslizar para cima |
| Deslizar | Seta para baixo ou S | Botão desliza ou deslizar para baixo |
| Clarão da lanterna | Espaço | Botão Clarão |
| Pausar / som | P / M | Botões no canto da tela |

Obstáculo âmbar pede pulo, azul pede deslize, pedra e espinho pedem desvio.

## Rodar

```bash
npm install
npm run dev      # servidor local
npm run build    # gera dist/index.html, o jogo inteiro em um arquivo
```

## Como é feito

- `src/art/sculpt.js`: escultor por SDF. Gera a malha dos personagens e os pesos do esqueleto em código, sem modelo externo.
- `src/art/gnome.js` e `src/art/monster.js`: personagens e animação procedural com IK.
- `src/art/forest.js`, `terrain.js` e `props.js`: floresta, terreno, céu e obstáculos gerados na hora.
- `src/core/world.js`: mundo curvo e decoração em loop no shader.
- `src/core/post.js`: pós-processamento e ajuste automático de qualidade.
- `src/core/audio.js`: música e efeitos sintetizados com Web Audio.
- `test/`: testes com Playwright. Usam o caminho do Chromium desta máquina e o servidor na porta 5199; ajuste em cada script.

Feito com [three.js](https://threejs.org), [postprocessing](https://github.com/pmndrs/postprocessing) e [GSAP](https://gsap.com).
