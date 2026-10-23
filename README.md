# Survivors-like — reconstrução baseada em engenharia reversa

Como jogar: abra `jogar.bat` (ou `index.html` em qualquer navegador). WASD/setas = mover, 1-9 = personagem / escolha de upgrade, P = pausa.
Sem build, sem dependências. Teste headless: `node _evidence/sim.js`.

**Escopo:** só uma fase (Mad Forest), 9 personagens, 38 armas (19 + 19 evoluções), 14 passivos, 5 chefes, música e efeitos. Tudo em inglês.
**Arte, fonte e textos (v2):** os sprites (`assets/`, 640 KB), a fonte pixel e as frases de UI/level-up foram **extraídos do seu jogo instalado** (UnityPy), **apenas para uso pessoal local**. Esta pasta contém material de terceiros: **não publique nem compartilhe**. Áudio não foi extraído (o jogo está mudo). A versão anterior com arte procedural está em `_evidence/game_v1_procedural.js`.

## Evidência de cada item

| # | Afirmação | Evidência | Tipo |
|---|-----------|-----------|------|
| 1 | `VampireSurvivors.exe` é só o launcher Unity (PE x64, 672 256 B, sha256 `438e17b2…70d8`) | REA `inspect_pe_resources` → `ev_5203ba7f7cc7cab1f1028807579f5b82316359d85687c5eba3354c8aa03bf0bd` (12 recursos, ícones 16→256) | observado |
| 2 | Engine = Unity **IL2CPP** | Pasta tem `GameAssembly.dll` (150,9 MB), `UnityPlayer.dll`, `il2cpp_data/Metadata/global-metadata.dat`, `ScriptingAssemblies.json`; `app.info` = `poncle / Vampire Survivors` | observado |
| 3 | Não há JS/Electron | `resources/app` contém só `.webpack/renderer/steam_autocloud.vdf` | observado |
| 4 | Metadata IL2CPP v31 legível | magic `0xFAB11BAF`, versão 31, 312 502 identificadores (`_evidence/meta.py`) | observado |
| 5 | Arquitetura de gameplay | Identificadores: `WeaponData`, `WeaponFactory`, `ProjectileFactory`, `LevelUpFactory`, `StageData`, `ArcanaData`, `EvolutionData`, `TreasureChest`, `CharacterController*`, `EnemyController*`, `Spawn*` | observado (nomes; **não** o corpo dos métodos) |
| 6 | Dados de balanceamento são JSON puro em `resources.assets` | 8 blocos JSON válidos (`_evidence/ex.py`); offsets: armas+passivos 16545584, inimigos 16783184, fases 17148800, pickups 17489200, personagens 17537508; sha256 do arquivo `f5af384c…` | observado |
| 7 | Armas: nível 1 + deltas por nível; evolução por `evoInto`/`evoSynergy`/`requires` | Ex.: Whip 8 níveis, último delta `addEvolvedWeapon: VAMPIRICA`, requer `MAXHEALTH` | observado |
| 8 | Ondas do Forest por minuto (`minimum`, `frequency`, `enemies`, `bosses`, `events`) e eventos `BAT_SWARM`/`FLOWER_WALL`/`GHOST_SWARM`/`CYCLE_COMPLETE` (min 30 → `BOSS_XLDEATH`) | bloco de fases, 31 entradas | observado |
| 9 | Stage mods: `TimeLimit 1800`, `PlayerPxSpeed 1.1`, `EnemySpeed 1.1` | idem | observado |
| 10 | Deltas de personagem (Antonio +0,1 dano a cada 10 níveis; `growth +1` no nv20 cancelado por `−1` no nv21) | bloco de personagens; aplicados literalmente e testados em `sim.js` | observado |
| 11 | Descrições de passivos batem com os campos (ex.: Spinach "+10% dano" ↔ `power: 0.1`) | blocos de passivos | observado → base da regra "soma aditiva" (**inferência**) |

### Evidência da v2 (arte e texto)
| # | Afirmação | Evidência |
|---|-----------|-----------|
| 12 | Sprites dos personagens estão nos bundles Addressables, 4 frames de caminhada por skin | `StreamingAssets/aa/StandaloneWindows64/vs_local_assets_character_<nome>.bundle`; o JSON diz `skins[DEFAULT].spriteName = newAntonio_01.png`, `walkingFrames: 4` (Poe = `newOld3`) |
| 13 | Inimigos: idle = `<Base>_i01..i04` | `vs_local_assets_enemies.bundle` (2.388 recortes) e `enemies_universal.bundle` (2.357); o `frameNames` do JSON (ex.: ZOMBIE → `Ghoul1_0`) dá a base |
| 14 | Ícones de armas/passivos | `frameName` do JSON (ex.: `Whip.png`) em `resources.assets` (atlas `tps_lossless_icons`) |
| 15 | Fundo do Forest é um tile de grama | `vs_local_assets_bg_forest.bundle` (1024², `isTiling: true` no JSON da fase) |
| 16 | Fontes no jogo | `resources.assets`: `PerfectDOSVGA437`, Roboto, LiberationSans, Arial Unicode; `LanaPixel` só existe como atlas SDF (sem TTF), por isso uso a DOS |
| 17 | **Textos oficiais em inglês** | Tabela de localização em `resources.assets` (offset ≈45,5 MB): `lang/levelup_header` = "Level Up!", `lang/treasure_header` = "Treasure Found!", `lang/weaponLevelUp_*` = frases de level-up (5.169 chaves parseadas, `_evidence/loc.py`) |
| 18 | Escala de dano ×10 das armas confirmada | `weaponLevelUp_damage` = "Base Damage up by %0." e Whip nv3 tem `power +0.5` → "up by 5"; golpe inicial do Whip (`power 1`) aparece como 10 na tela |
| 19 | Mapeamento campo→frase de level-up | `describeLevel()` em `game.js`; a escolha de qual chave usa cada campo (`power`→damage, `area`→area, `amount`→projectile(s) …) é **inferência**, não leitura do código |

## v3 — caos visual, armas novas e chefes

**Armas novas (stats e evoluções vêm do JSON do jogo):** Santa Water→La Borra, Runetracer→NO FUTURE, Peachone + Ebony Wings→Vandalier, Song of Mana→Mannajja, Pentagram→Gorgeous Moon, Laurel (sem evolução: a dele exige Metaglios, não implementados). Evolução exige o que o JSON diz (`requires`, `evoSynergy`, `requiresMax`, `evolvesFrom`): Vandalier só nasce com as DUAS aves no nv8; Mannajja precisa de Curse; La Borra de Attractorb; NO FUTURE de Armor.
**Orbitais/circulantes (pedido seu):** King Bible/Vespers (livros com brilho e anel tracejado), Peachone/Ebony/Vandalier (aves em espiral), Laurel (folhas girando + escudo que absorve golpes), Garlic (aura pulsante).
**Caos visual:** brilho aditivo, partículas (limite 2.400 + orçamento por frame), tremor de tela, flash, números de dano maiores nos críticos, e visual **por nível da arma** (`tierK`): cresce a escala, o brilho e o rastro; evoluções ganham rastro arco-íris em algumas armas. Projéteis ficam ~1,5× maiores desde o nível 1; os **stats não mudaram**, então o nivelamento continua igual.
**Dificuldade:** a quantidade de inimigos **não foi aumentada**; o caos vem dos efeitos. Curse (novo passivo) só aumenta inimigos se você escolher.
**Chefes (5/10/15/20/25 min, Morte aos 30):** aviso de 2,2 s com letterbox e texto, inimigos comuns viram gemas, só o chefe em campo, ao vencer: baús (1 a 3), gemas e o spawn volta. HP do chefe = DPS recente do jogador × 40 s (mín./máx. por chefe em `bosses.js`), então a luta dura ~40 s com qualquer build. Se o chefe durar mais de 90 s, chegam reforços (os inimigos voltam a surgir) para o jogo nunca travar; ele segue vivo até ser derrotado. Telegrafia vermelha antes de cada ataque. Ataques: Elon (foguetes + investida), Trump (onda de choque + laços), Pepe (pulo com pouso + anel de orbes), Doge (chuva de moedas + espiral), Bitcoin Bull (investida + leque de velas).
**Arte dos chefes:** caricaturas em pixel-art **desenhadas por mim em código** (`bossart.js`), sem fotos nem assets de terceiros; se quiser rostos específicos, é só trocar por PNGs.
**Filtro de tensão:** durante aviso e luta a tela dessatura, ganha tinta vinho/roxa, vinheta pulsando e contraste; transição suave (~1,5 s).

### Evidência da v3
| # | Afirmação | Evidência |
|---|-----------|-----------|
| 20 | Stats/evoluções das armas novas | JSON `resources.assets` (ex.: SILF3 `evolvesFrom: [SILF, SILF2]`, `requiresMax: [SILF]`; BORA `requires: [MAGNET]`; MANNAGGIA `requires: [CURSE]`) |
| 21 | Sprites das aves/Laurel/brilhos | `Silf1/2/3.png`, `Laurel.png`, `FlareStar*.png`, `MagicCircleRed.png` (resources.assets) |
| 22 | Lógica dos chefes e armas novas | `_evidence/test_boss.js`: 29 armas causam dano, escudo absorve, 4 evoluções novas, fluxo aviso→chefe→baú→spawn retomado, 5 chefes entram e atacam |
| 23 | Desempenho | Edge headless, `__bench`: 2,5 ms/frame (pior 6,4 ms) com 2.269 partículas, 172 projéteis, 156 inimigos; 1,5 ms só com orbitais lv8 |
| 24 | Bug real de desempenho achado e corrigido | `ctx.filter` por inimigo atingido deixava a cena >130 s sem terminar; trocado por silhuetas em cache → 3,6 s |
| 25 | Capturas | `_evidence/v3_*.png` |

## v4 — imagens reais dos chefes, som e mais orbitais

**Chefes com imagens reais** (`assets/bosses/`, créditos em `CREDITS.md`): Elon e Trump (domínio público), Doge (foto do Kabosu, CC0), Pepe (arquivo CC0 de terceiro, licença incerta, recolorido de azul para verde) e Bitcoin Bull (touro Brahman CC BY-SA 4.0 + logo ₿ de domínio público). Recorte nítido em medalhão redondo (Elon, Trump, Doge) ou recorte direto (Pepe, touro). Pipeline: `_evidence/fetch_commons.py` + `_evidence/make_bosses.py`. **Uso pessoal local; não publique.**
**Som:** não existia áudio nas versões anteriores (omissão minha). Agora há 41 efeitos e 6 músicas **extraídos do jogo instalado** (`_evidence/extract_audio.py`), normalizados com ffmpeg e embutidos em `audio_*.js` (assim o duplo-clique em `jogar.bat` funciona). Música do Forest na fase, uma faixa diferente por chefe com troca suave, música abafa em menus/level-up/aviso. **Teclas: M = mudo, − / + = volume.** O navegador só libera som após o 1º clique/tecla (o menu avisa). `audio_test.html` toca cada som/música para você aprovar ou pedir troca.
**Orbitais novos (design próprio):** Halo Blades→Crown of Blades (dois anéis em sentidos opostos), Ember Orbs→Solar Corona (rastro de brasas), Frost Shards→Glacier Wheel (atrasa inimigos, campo gelado), Storm Satellites→Thunder Crown (raios em cadeia). Evoluções pedem Speed / Might / Empty Tome / Duplicator respectivamente. Todos com aura, anel tracejado, brilho e rastro.
**Balanceamento:** `_evidence/dps_harness.js` mede o dano contra dummies (A = multidão de 40, B = alvo único) por nível. Referência (armas clássicas): ~20 / 61 / 250 de DPS em grupo nos níveis 1 / 4 / 8; evoluções ~600–1300. Resultado final dos novos: Halo 21/56/279, Ember 18/69/255, Frost 19/40/153 (tem o bônus de atrasar), Peachone 17/47/230, evoluções Crown 613, Solar 711, Glacier 539, Thunder 502, Vandalier 919.
**Defeitos achados e corrigidos nesta rodada:** (1) o Peachone causava de 15× a 48× o dano do King Bible (aves sobrepostas) → recarga por inimigo compartilhada + uma leva por vez; (2) **regressão minha**: um comentário no meio de uma linha desligava o contador de tiros e o chicote parou de acertar; pego pelo teste do Antonio com 0 abates e corrigido; (3) ao limpar os inimigos no aviso do chefe, as gemas abriam menus de level-up em cima do aviso → agora ficam no chão.
**Ponto de atenção (não alterado):** o Lightning Ring no nível 8 dá ~1.400 de DPS em grupo, cerca de 5× as outras armas do mesmo nível.

## v5 — Antonio como xerife do velho oeste
Os frames originais do Antonio ganharam, por código (`_evidence/make_sheriff.py`): chapéu de xerife, estrela dourada no peito, lenço vermelho (a faixa azul foi recolorida) e colete de couro marrom (o verde foi recolorido). A arma dele (chicote) já é um laço. No menu o nome vira "Sheriff Antonio". É o visual padrão; a tecla **K** no menu volta ao Antonio original. Só o Antonio foi vestido; os outros 8 personagens continuam como estavam.

## v6 — passe visual "cartoon" (inspirado no estilo do Hades)
Só renderização, sem mudar jogabilidade: chão procedural de pedra escura azul/violeta com bisel, rachaduras e **runas pulsantes** coloridas; adereços do próprio tileset da floresta (plantas com frutas, flores, caveira, tronco); **contorno grosso** nos sprites (escuro nos inimigos, vermelho nos elites, creme no herói), luz quente em volta do herói, brilho nas gemas, vinheta e gradação de cor mais viva (`saturate 1.3`, `contrast 1.06`). Desempenho medido: ~1 ms por frame (pior ~5 ms). A versão anterior do render está em `_evidence/render_v5_before_toon.js`. **Limite:** os sprites continuam sendo os pixel-art originais; isso dá o clima, não o desenho pintado à mão do Hades (isso exigiria redesenhar ~150 imagens).

## v7 — personagens e inimigos Pokémon
Skin padrão agora é **Pokémon** (tecla **K** no menu alterna Pokémon / Xerife / Original). Personagens: Porta=Pikachu, Antonio=Bulbasaur, Arca=Charizard, Imelda=Alakazam, Gennaro=Scyther, Lama=Machamp, Poe=Gengar, Dommario=Mew, Krochi=Lucario (mesmos atributos e armas de antes). Inimigos: Zubat/Golbat/Crobat (morcegos), Rattata/Poochyena/Ekans, Cubone/Marowak/Sandshrew/Sandslash/Diglett/Geodude (esqueletos), Duskull, Graveler, Oddish/Bellsprout/Gloom, Mightyena, Vileplume, Pinsir, Onix, Darkrai (a Morte). Os 5 chefes de memecoin continuam como estavam.
**Inimigo x jogador (pedido): ** inimigos têm **contorno carmim e anel vermelho** no chão (elites: vermelho vivo e mais grosso); o jogador tem **contorno claro e anel verde**. Nenhum inimigo usa a mesma espécie de um jogador. Sprites animados do Pokémon Showdown (`gen5ani`), 4 quadros por Pokémon, escala própria por sprite (`_evidence/make_pokemon.py`). Material da Nintendo/Game Freak, uso público por decisão do usuário.

## v8 — multiplayer online (até 4 por sala) + ajustes de balanceamento
**Como rodar:** `online.bat` (inicia `server.js` na porta 8780 e abre o navegador). `jogar.bat` continua abrindo só o modo solo. No menu: apelido + **PLAY ONLINE** (ou tecla O) / **SOLO**.
**Arquitetura:** o servidor (`server.js`, Node + `ws`) roda a simulação inteira da sala a 30 Hz com o MESMO `game.js` do solo; cada jogador manda a própria posição (~20x/s, o servidor limita a velocidade e ignora posições logo após um teleporte); snapshots a 15 Hz filtrados por visão (só o que está perto da câmera). `net_client.js` monta um objeto com a mesma forma do `Game` para o `render.js` desenhar (inimigos suavizados, projéteis extrapolados, órbitas com velocidade angular estimada). Salas aleatórias sem código; matchmaker prefere salas recém-iniciadas (<90 s), depois salas em andamento (<28 min), senão cria uma (máx `MAX_ROOMS`=6).
**Regras (pedidas):** XP individual + 30% do XP de cada gema repassado aos amigos; level-up em cartões no canto que **não pausam** (escolha automática em 15 s); quem cai deixa uma **lápide** e assiste um amigo (setas ←/→); um amigo vivo que fique a menos de 55 px da lápide por **5 s** ressuscita o jogador (barra de progresso; recua se o amigo se afastar; metade da vida, 10 s de proteção, mantém nível/armas; sem limite de vezes, a lápide só some quando a pessoa volta); a meta é **aguentar até 30:00 = VITÓRIA** (o time vence se ao menos um estiver vivo); se todos caírem ao mesmo tempo é fim de jogo; nos dois casos aparece o ranking (nível, abates, dano, resultado); sem banco/conta/placar; sem chat livre — só frases prontas (teclas Z X C V B N).
**Entrada no meio da partida (catch-up):** ~60% do nível médio dos amigos com armas/itens automáticos, XP x2 até alcançar, 10 s de proteção, aparece perto dos amigos; durante aviso/luta de chefe espera e entra quando acaba.
**Escalonamento (DESIGN, não vem do jogo):** +60% de inimigos e +25% de vida por jogador extra; teto de inimigos +120 por jogador extra; vida do chefe segue o DPS do grupo.
**Anti-abuso:** apelido filtrado (letras/números, 12 caracteres, lista de palavras bloqueadas), 8 conexões por IP, limite de mensagens, ping/pong derruba conexões mortas, o servidor valida velocidade e escolhas; o cliente nunca decide dano, XP ou nível.
**Testes (nada precisa esperar 30 min):** `node _evidence/test_mp.js` (lógica N-jogadores, pula o tempo), `node _evidence/mp_bots.js <porta> <bots> <s> [tardio_s]` (bots por WebSocket contra o servidor real; use `TIME_SCALE=40 TEST_GOD=1 node server.js` para uma partida de 30 min em ~45 s), `_evidence/mp_browser.py` e `mp_browser2.py` (2 navegadores Edge de verdade na mesma sala: cartões, emote, jogador caído, resultados). Custo medido do servidor: ~1,8 ms por passo de 30 Hz no pior caso (4 jogadores, ~550 inimigos) ≈ 5% de um núcleo por sala.
**Balanceamento do começo (feedback de jogo):** Pikachu — o raio do Lightning Ring só atinge perto (150 + 28·nível px) e não limpa a tela; Machamp — o machado agora arremessa na direção do inimigo mais próximo (dano contra alvo único 1 → 4); Mew — velocidade 0,6 → 1,05 (os 0,6 do original ficavam mais lentos que os morcegos).
**Limitações conhecidas:** sem reconexão (cair = sair da sala); posição do próprio jogador é confiada ao cliente dentro do limite de velocidade (suficiente entre amigos, não é à prova de trapaça); nenhum playtest humano com 3-4 pessoas ainda.

## NÃO recuperado (escolhas de design desta versão — marcadas `[DESIGN]` em `game.js`)

O decompilador não estava disponível: `binary_session` mostrou Ghidra `not_configured` (`GHIDRA_INSTALL_DIR` vazio, Java sem caminho absoluto). Não instalei nada por conta própria. Portanto **a lógica em `GameAssembly.dll` não foi lida** e estes valores são meus:

- Curva de XP (`XpRequiredToLevelUp` existe no metadata, corpo não lido): usei `5 + 10·(nível−1)`.
- Escala de `maxHp` dos inimigos: usei ×10 como nas armas (a das armas está confirmada, a dos inimigos não).
- Qual sprite de projétil cada arma usa (ex.: Magic Wand → `ProjectileFlameBlue`), animação do chicote (meia-lua esticada, não a animação original), HUD/painéis (feitos com os frames do jogo, layout meu), efeitos de acerto/morte.
- v3 (tudo DESIGN, não vem do jogo): HP/ataques/arte dos chefes, mapeamento de qual sprite cada arma nova usa (Peachone→pomba branca etc.), animações e efeitos de partículas, visual por tier, filtro de tensão, pentagram dispara 1ª vez aos 20 s.
- v4 (DESIGN): qual efeito sonoro toca em cada evento e a qual chefe cada música é atribuída; a ligação exata entre o clipe `bgm_elrond_forest` e os títulos "The Beginning"/"Forest Night Fever" (MUSIC_DATA) não foi confirmada; os 4 orbitais novos (nomes, stats, comportamento) são invenção minha calibrada pelo teste de DPS.
- Fonte: a original da UI (LanaPixel) não pôde ser extraída; usei PerfectDOSVGA437.
- Pixels: velocidade base do jogador (100 px/s), `enemy.speed × 0,5`, raios/alcances de cada arma, forma dos projéteis, tempo de invulnerabilidade (0,6 s).
- Semântica exata de `minimum`/`frequency` das ondas; tamanho dos enxames; HP dos inimigos não escala com o tempo.
- Não implementado: lifesteal do Bloody Tear, arcanos, bestiário, outras 22 fases, 61 personagens, loja, destrutíveis (braseiros), frango, rosário etc.

## Resultado dos testes (`node _evidence/sim.js`)
- 18/18 armas (base + evoluída) causam dano em simulação isolada.
- Evolução via baú: Whip nv8 + Hollow Heart → Bloody Tear; sem o passivo, não evolui.
- Partida completa de 30 min com bot (Gennaro): chegou a 30:00, a Morte apareceu e encerrou a partida; sem NaN em nenhum dos 9 personagens.
- Falha esperada do bot: Dommario (moveSpeed 0,6) morre cedo porque os morcegos (≈77 px/s) são mais rápidos que ele (≈66 px/s) — consequência dos dados, não bug.
- Renderização verificada em Edge headless (`_evidence/*.png`). **Não houve playtest humano**, então o "feeling" do balanceamento não está validado.
