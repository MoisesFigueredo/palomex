# Palomex

Runner 3D de navegador para PC e celular: o gnomo Tonho foge do Cramunhão do Brejo pela floresta à noite.

Jogue em https://palomex.vercel.app

## Controles

| Ação | PC | Celular |
|---|---|---|
| Mudar de pista | Setas ou A/D | Deslizar para os lados |
| Pular | Seta para cima ou W | Deslizar para cima |
| Deslizar | Seta para baixo ou S | Deslizar para baixo |
| Clarão da lanterna | Espaço | Botão Clarão |
| Pausar / som | P / M | Botões no canto da tela |

Galho e obstáculo âmbar pedem pulo, O cipó com espinhos balança entre as pistas. A lama roxa não derruba, mas atrasa e aproxima o monstro. Obstáculo azul pede deslize, pedra e espinho pedem desvio. Pássaro e tatu vêm de frente e marcam a pista no chão; do tatu também dá para pular. O que cai do céu mira nos pés do gnomo, trava e cai na cabeça de quem não sair de baixo. Deslizar para fora da pista, já estando na beirada, dá um dano pequeno.

## Vida

A vida vai até 100 e volta sozinha, 2,5 por segundo. Cada tapa tira 60, então com 60 ou menos o próximo mata; a marca na barra mostra essa linha. O monstro fica na tela enquanto a vida está abaixo dela, uns 10 segundos depois do tapa. O Clarão recupera 40.

## Fase extra

A folha de cannabis e o cogumelo mágico são raros na pista. Ao pegar um, surge o tronco velho gigante na estrada e o gnomo desce o tobogã por dentro. A folha faz uma descida lenta e cheia de bolota; o cogumelo, uma descida rápida e colorida com bolota em dobro. Lá dentro só há nós de desviar: no celular, basta virar o aparelho para os lados (ou deslizar o dedo). Não se morre lá dentro, mas bater derruba bolotas, e na saída o monstro ficou para trás.

## Loja

Cada partida soma bolotas: as catadas mais 1 a cada 25 metros. Na tela de derrota, Menu leva à loja de Acessórios, onde dá para experimentar antes de comprar. Saldo e itens ficam guardados no navegador.

## Ranking mundial

A API em `api/rank.js` guarda o melhor resultado de cada jogador em um Postgres (Neon). A conexão vem da variável `DATABASE_URL`, que fica só no servidor. Para criar a tabela: `DATABASE_URL=... node scripts/db-init.mjs`. Para publicar: `bash scripts/deploy.sh`.

## Rodar

```bash
npm install
npm run dev      # servidor local
npm run build    # gera dist/index.html, o jogo inteiro em um arquivo
```

## Como é feito

- `src/art/sculpt.js`: escultor por SDF. Gera a malha dos personagens e os pesos do esqueleto em código, sem modelo externo.
- `src/art/gnome.js` e `src/art/monster.js`: personagens e animação procedural com IK.
- `src/art/tube.js`: tobogã, tronco e os itens da fase extra.
- `src/art/accessories.js`: acessórios e pano animado.
- `src/art/bird.js`: o pássaro esquisito, no mesmo escultor.
- `src/art/forest.js`, `terrain.js` e `props.js`: floresta, terreno, céu e obstáculos gerados na hora.
- `src/core/world.js`: mundo curvo e decoração em loop no shader.
- `src/core/post.js`: pós-processamento e ajuste automático de qualidade.
- `src/core/audio.js`: música e efeitos sintetizados com Web Audio.
- `test/`: testes com Playwright. Usam o caminho do Chromium desta máquina e o servidor na porta 5199; ajuste em cada script.

Feito com [three.js](https://threejs.org), [postprocessing](https://github.com/pmndrs/postprocessing) e [GSAP](https://gsap.com).
