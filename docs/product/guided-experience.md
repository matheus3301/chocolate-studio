# Experiência guiada do Chocolate Studio

**Proposta para revisão; não autoriza implementação.** Base: beta.3, `3a7de7f`. Este brief orienta um protótipo de pesquisa separado da aplicação.

**Correção após relato de operação:** para a apresentação numérica observada, localizar a atribuição por **“004 · botão A”**, com navegação **000–003 → 004–007**, em vez de exigir “Banco 2”. Ver [navegação pelo visor](display-navigation.md), que prevalece sobre referências genéricas a grupos como rótulo principal neste brief. O protótipo atual ainda não representa essa navegação.

## 1. Resultado e evidência

Pessoa: músico iniciante em MIDI preparando o pedalboard. Resultado desejado: **configurar A/toque → M5 preset 1 e A/segurar → M5 preset 2, conferir no equipamento e guardar uma cópia**, sem precisar aprender PC/CC. Meta proposta: ≥80% dos participantes em até 8 minutos, sem orientação do moderador. Não é pesquisa realizada nem superioridade já demonstrada sobre CubeSuite.

Invariantes: client-only, PT-BR/EN, importação/exportação, preservação da configuração existente e dos bytes desconhecidos. Sem conta, backend, upload, slogans, painel técnico na entrada, reset ou firmware. M5 é o primeiro template, não uma dependência do núcleo genérico. **TONEX ONE+** é o modelo declarado pelo usuário; não substituir por ONE/pedal TONEX nem mostrar perfil pronto/selecionável antes de documentação e qualificação exatas.

| Evidência | Conclusão permitida / limite |
| --- | --- |
| Feedback explícito do usuário | A beta.3 parece complexa; pediu conexão guiada e editor focado. A representação física foi aceita. Um relato não representa todos os iniciantes. |
| [Qualificação da beta](../release-qualification.md), experimento 003 ali citado | Comunicação, leitura integral, escrita/releitura e restauração foram exercitadas. Não comprova saída ao pisar, controle do M5, power-cycle ou outros firmwares. |
| [M5 Pilot’s Guide Rev A, PDF pp. 6 e 8][M5] | Presets 01–24 = PC0–23; CC69 afinador, CC64 tap, CC11 efeito, CC1 expressão. Canal configurável; 1 é o padrão, não uma leitura do canal atual. CC arbitrário por parâmetro não é documentado. |
| [Chocolate User Manual 26.1.8, pp. 1–4][C1] | E=A+B e F=C+D simultâneos; avançado descrito com oito grupos, sem troca de BANK por E/F; inclui toque curto/longo. |
| [Chocolate Software Instructions, PDF pp. 2, 4–7][C2] | PC/CC usam E/F para grupos; Advanced Custom Mode 1 não troca bancos por E/F; Advanced Custom Mode 2 descreve essa troca e até 16 grupos. Não generalizar entre modos/versões. |

Lidas as cópias dos três PDFs fornecidas pelo coordenador em `research/manuals`; fontes públicas ao final. Os manuais não autorizam novos comandos de protocolo. O catálogo de pesquisa está ligado na seção 6; seus comandos documentados não equivalem a implementação ou teste no destino. Pisada, duração do gesto e rota Chocolate→M5 continuam hipóteses de viabilidade a qualificar.

## 2. Três dores priorizadas e alternativas

Prioridade qualitativa por dependência e risco; sem escores de pesquisa inventados.

| Dor hipotética | Alternativas consideradas | Escolha / experimento |
| --- | --- | --- |
| **P1: “Não sei se conectei certo nem se vou perder o que já tenho.”** | A. Wizard com leitura/cópia. B. Checklist lateral no editor. C. Tutorial antes da conexão manual. | **A** no primeiro uso; B na retomada. Ensaiar permissão negada, leitura e reconexão sem perda. |
| **P2: “Sei o som que quero, não o número MIDI.”** | A. Equipamento + ação musical. B. Receita de pedalboard completo. C. Tabela PC/CC com ajuda. | **A**; C no Avançado. B pode substituir escolhas indevidamente. Testar A/toque/segurar sem ensinar MIDI. |
| **P3: “Não sei o que foi salvo nem se funciona ao pisar.”** | A. Revisão musical + salvar no Chocolate + teste físico separado. B. Botão genérico “Salvar”. C. Só baixar arquivo para aplicar em outro programa. | **A**, mantendo download distinto. Testar se a pessoa distingue arquivo, armazenamento conferido e resultado no M5. |

```text
Resultado: atribuir e conferir A/toque + A/segurar sem conhecer MIDI
├─ Conectar sem perder dados → wizard de leitura/cópia → ensaio de recuperação
├─ Escolher pelo som         → equipamento + ação     → tarefa M5 1/2
└─ Entender o salvamento     → revisão + teste separado → checagem de compreensão
```

## 3. Percurso e telas para o protótipo

```text
Primeiro uso: Conectar/ler → Equipamento → Editor → Revisão → Gravar/reler → Teste no M5
                    └ editar sem conectar ────────┘          (indisponível sem leitura)
Retorno: Continuar rascunho → Editor → Reconectar/ler → Comparar, se mudou
```

Uma decisão principal por tela. Idioma e ajuda disponíveis; diagnóstico fechado. Não escrever ao conceder permissão, escolher equipamento, importar ou selecionar a ilustração. A escolha do M5 é declaração do usuário, não detecção automática.

### W1 — Conectar e ler

```text
Conectar seu Chocolate
Vamos ler a configuração atual sem alterá-la.
[ Conectar e ler ]
Editar sem conectar     Abrir projeto     Ajuda para conectar
```

Após permissão, confirmar explicitamente o par entrada/saída; várias portas exigem escolha, sem abrir nomes semelhantes silenciosamente. Identidade vem da resposta, não do nome da porta. Só uma leitura completa válida conta como configuração observada. Preservar cópia integral; nunca começar com restauração/default sobre o dispositivo.

| Momento | PT-BR | EN |
| --- | --- | --- |
| Título / ação | Conectar seu Chocolate / **Conectar e ler** | Connect your Chocolate / **Connect and read** |
| Intenção | Vamos ler a configuração atual sem alterá-la. | We’ll read the current configuration without changing it. |
| Permissão pendente | Abra esta aba e permita o controle MIDI no aviso da barra de endereço. | Bring this tab to the front and allow MIDI control in the address-bar prompt. |
| Portas | Entrada / Saída / **Usar estas portas** | Input / Output / **Use these ports** |
| Progresso | Lendo a configuração do Chocolate… | Reading the Chocolate configuration… |
| Conclusão | Configuração lida. Nada foi alterado. **Continuar** | Configuration read. Nothing was changed. **Continue** |
| Alternativas | **Editar sem conectar** / **Abrir projeto** | **Edit without connecting** / **Open project** |

Ajuda contextual [C1, p. 2]: configuração USB usa a posição U e a porta de computador indicadas; o manual declara HOST indisponível nessa condição. Não confundir conexão de configuração com rota de execução. O M5 recebe por MIDI IN; **não instruir ligação USB direta ao M5**. Interface/adaptador e rota física precisam de confirmação própria.

### W2 — Equipamento

```text
O que você vai controlar?
( ) M5 · Line 6
( ) Outro equipamento · MIDI Avançado

M5: Canal de comunicação [1 ▼]   Como conferir no M5
[ Voltar ]                                [ Editar botões ]
```

| Elemento | PT-BR | EN |
| --- | --- | --- |
| Pergunta | O que você vai controlar? | What will you control? |
| Opção genérica | Outro equipamento · MIDI Avançado | Other equipment · Advanced MIDI |
| Canal | Use o mesmo canal configurado no M5. O padrão do manual é 1; confira o seu. | Use the channel set on your M5. The manual’s default is 1; check yours. |
| Limite | A ligação ao M5 será conferida no teste final. | The M5 connection will be checked in the final test. |
| Navegação | **Voltar** / **Editar botões** | **Back** / **Edit switches** |

Confirmar canal na mesma tela, sem etapa técnica adicional. Aplicá-lo às novas ações, não reescrever canais existentes. TONEX ONE+ pode aparecer apenas como previsão não selecionável, nunca como perfil concluído. O protótipo existente é um subconjunto ilustrativo, com conexão/gravação simuladas; não é evidência de implementação ou hardware.

### E1 — Editor físico e ações musicais

```text
M5 · Editando configuração          [ Revisar e salvar no Chocolate ]
[ Baixar projeto ] [ Arquivo ]                    Conectar, se necessário

              [ A ] [ B ] [ Editando A ] [ C ] [ D ]
                  E                         F
Botão A
Ao dar um toque   [ Usar preset ▼ ] [ 1 ▼ ]
Ao segurar        [ Usar preset ▼ ] [ 2 ▼ ]
Outros comportamentos · Detalhes MIDI
```

Foco no botão e sua intenção; manter corpo baixo único e visor **Editando / Editing**, não estado físico ao vivo. E/F são marcas físicas não interativas, sem campos, cartões ou aviso-placeholder de edição. Explicar seu papel por modo na ajuda, não prometer “banco anterior/próximo”.

| Elemento | PT-BR | EN |
| --- | --- | --- |
| Gestos | Ao dar um toque / Ao segurar | On a tap / On a hold |
| Ação | Usar preset / Preset 1 | Select preset / Preset 1 |
| Segunda ação ausente | **Adicionar ação ao segurar** | **Add a hold action** |
| Seleção | Editando A | Editing A |
| Rascunho | Estas alterações ainda não estão no Chocolate. | These changes are not on the Chocolate yet. |
| Saída | **Revisar e salvar no Chocolate** / **Baixar projeto** | **Review and save to Chocolate** / **Download project** |

Exemplo obrigatório: preset 1 gera PC0; preset 2 gera PC1; canal confirmado. Toque + segurar usa o comportamento curto/longo, **não** alternância entre dois toques. Não inventar duração em milissegundos ou declarar emissão física exclusiva já verificada.

Alterar somente a ação escolhida no rascunho. Se o comportamento lido alterna ou usa pressionar/soltar, confirmar conversão: **“A passará a usar toque e segurar. Confira as duas ações antes de salvar.” / “A will use tap and hold. Check both actions before saving.”** Preservar outros botões/grupos. Não chamar a segunda sequência de “segurar” quando o comportamento for outro; não reinterpretar comandos existentes como M5 sem correspondência exata.

### R1 — Revisão e salvamento

```text
Salvar no Chocolate
A · Toque:   [anterior] → M5 preset 1
A · Segurar: [anterior] → M5 preset 2
Modo: [atual] → [necessário, se mudar]
Outras configurações serão preservadas.
[ Voltar a editar ]                        [ Salvar no Chocolate ]
```

Mostrar primeiro gesto, equipamento, canal e mudança de modo; hex apenas em detalhes. Pré-condições: baseline recente e cópia integral recuperável. Se armazenamento falhar, orientar download e confirmação de guarda; iniciar download não comprova recuperação.

Sequência PT/EN: **“Gravando no Chocolate…” / “Saving to Chocolate…”** → **“Conferindo a configuração…” / “Checking the configuration…”**. Só após ACK + releitura válida + comparação: **“Configuração salva e conferida no Chocolate.” / “Configuration saved and checked on the Chocolate.”** Depois: **“Agora confira o resultado no M5.” / “Now check the result on your M5.”** Envio/ACK isolados nunca bastam.

### T1 — Teste físico separado

**“Dê um toque em A. O M5 mostrou o preset 1? Depois segure A: mostrou o preset 2?” / “Tap A. Did the M5 show preset 1? Then hold A: did it show preset 2?”**

Ações: **Sim, os dois / Yes, both**; **Não funcionou / It didn’t work**; **Testar depois / Test later**. “Sim” é relato da pessoa, não detecção automática. Adiar mantém **Resultado no M5 não confirmado / M5 result not confirmed**. Em falha, revisar ligação, canal, modo e atribuições; sem regravação automática. Orientar volume seguro. Isso não prova persistência após desligar/ligar.

## 4. Estados, erros e retomada

| Evento | Comportamento | PT-BR / EN |
| --- | --- | --- |
| Navegador incompatível/permissão negada | Oferecer navegador compatível e edição local; sem contornar permissão. | Use Chrome ou Edge no computador, ou edite sem conectar. / Use desktop Chrome or Edge, or edit without connecting. |
| Porta ausente/identidade incompatível | Voltar à seleção, gravação indisponível. Não inferir firmware do nome. | Não encontramos um Chocolate compatível. Confira a conexão. / No supported Chocolate found. Check the connection. |
| Timeout/leitura parcial/inválida | Tentar ler novamente; rascunho intacto, sem leitura/cópia fictícia. | Não conseguimos ler tudo. Nada foi gravado. / We couldn’t read everything. Nothing was written. |
| Voltar/cancelar wizard ou revisão | Manter escolhas/rascunho; invalidar resultados assíncronos antigos. Trocar portas invalida leitura. | **Voltar** / **Back**; **Voltar a editar** / **Back to editing** |
| Desconectar editando | Manter rascunho; bloquear gravação até nova identidade/leitura. | Chocolate desconectado. Seu rascunho foi mantido. / Chocolate disconnected. Your draft was kept. |
| Nova leitura diferente/dispositivo mudou | Comparar; manter rascunho ou usar leitura com cópia anterior. Sem mescla silenciosa; revisão antiga inválida. | A configuração mudou. Compare antes de salvar. / The configuration changed. Compare before saving. |
| Campo inválido/limite excedido | Erro junto ao campo, conservar valor aceito e focar primeiro erro ao continuar. | Não foi possível aplicar esta alteração. Revise o campo indicado. / This change couldn’t be applied. Review the highlighted field. |
| Falha após começar escrita/releitura divergente | Estado físico incerto. Não repetir automaticamente; oferecer reler e restaurar cópia compatível com confirmação. | Não conseguimos confirmar a gravação. Mantenha sua cópia. / We couldn’t confirm the save. Keep your backup. |
| Restauração comparada | Preservar também cópia do rascunho; não chamar de reset. | Cópia restaurada e conferida no Chocolate. / Backup restored and checked on the Chocolate. |
| Conflito entre abas | Não sobrescrever versão recente; baixar alterações e reabrir versão salva. | Este projeto mudou em outra aba. Guarde suas alterações antes de reabrir. / This project changed in another tab. Keep your changes before reopening. |
| Armazenamento local indisponível | Download disponível; nunca afirmar salvamento local. | As alterações ficam nesta aba. Baixe o projeto para guardá-las. / Changes remain in this tab. Download the project to keep them. |

Retorno: abrir projeto/rascunho local sem repetir equipamento; conexão anterior não vale como atual. Ler não substitui o projeto silenciosamente. Reconectar volta ao editor após comparação, não ao início do wizard. Bloquear edições que resultados assíncronos poderiam apagar; manter desconexão/cancelamento disponíveis, avisando incerteza se a escrita já começou. Edição sem conectar nunca fabrica leitura ou sucesso.

## 5. Bancos e observação de eventos

- A–D são botões; E/F são combinações físicas. Não criar mais dois campos editáveis.
- Duas sequências não significam universalmente bancos selecionáveis com o pé. Toque/segurar, alternância e pressionar/soltar são comportamentos diferentes.
- Nomear por gesto no editor simples; no Avançado, “Sequência 1/2” com comportamento explícito evita confundir Bank A/B com botões A/B. Dados existentes não mudam por trocar rótulos.
- Dizer **Grupo em edição / Group being edited**, não “grupo ativo”. Oito grupos armazenados não provam navegação física por E/F. Não habilitar modo avançado 2/16 grupos apenas pelo manual; exigir qualificação própria.
- **PC0/canal pode corresponder a vários botões, grupos ou gestos.** Evento recebido sem identificador unívoco não acende A nem muda a seleção. Diagnóstico pode listar correspondências possíveis, nunca afirmar uma pisada por adivinhação. Leitura de configuração não prova saída física no destino.

## 6. Templates e MIDI Avançado

Equipamento descreve a intenção; adaptador do Chocolate limita o que pode ser gravado. Template não é preset de áudio nem receita para sobrescrever o pedalboard inteiro.

Catálogo de pesquisa para revisão: [perfil M5](../../research/templates/line6-m5.json), [schema](../../research/templates/catalog.schema.json), [template A/toque/segurar](../../research/templates/line6-m5-tap-hold.template.json) e [contrato/limites](../../research/templates/README.md). Não são carregados pela aplicação; todas as ações estão sem teste no destino. A tabela resume o catálogo, fonte [M5 Rev A, PDF p. 8][M5]:

| Ação PT / EN | Mapeamento | Escopo |
| --- | --- | --- |
| Usar preset 1–24 / Select preset 1–24 | PC0–23; subtrair 1 só ao gerar comando. | Exemplo 1→0 e 2→1. |
| Ligar efeito / Turn effect on | CC11=127, dentro da faixa 64–127. | Ação explícita, sem presumir estado atual. |
| Desligar efeito / Bypass effect | CC11=0, dentro da faixa 0–63. | Ação explícita. |
| Marcar tempo / Tap tempo | CC64=127, dentro da faixa 64–127, por toque. | Qualificar cadência/gesto; não equivale a enviar BPM/clock. |
| Abrir afinador / Open tuner | CC69=127, dentro da faixa 64–127. | Ação explícita. |
| Fechar afinador / Close tuner | CC69=0, dentro da faixa 0–63. | Ação explícita. |
| Definir posição de expressão / Set expression position | CC1 com posição fixa 0–127 escolhida pelo usuário. | Ação musical documentada; depende das atribuições de expressão do preset. Não é entrada contínua nem atribuição de parâmetros. |

Não oferecer CC individual de ganho/delay/mix como documentado. Preferir ligar/desligar explícitos a “alternar efeito” com estado do M5 presumido.

O contrato do catálogo separa perfil exato/versionado, instância física nomeada com canal explícito e template do controlador. Para acrescentar equipamento PC/CC: arquivo de dados com nomes PT/EN, ações/parâmetros limitados, comandos determinísticos, pré-condições e fonte/página, seguindo o schema/README ligados acima; sem condicionais por marca na UI. O exemplo usa `line6.m5`, ação `select-preset` e parâmetro `preset-number`. Versão e vínculo da ação devem sobreviver à exportação; atualização não reinterpreta projeto antigo silenciosamente.

O template atribui só A; B/C/D e dados opacos permanecem intactos. Na integração atual, `shortLong` usa a ação `press` primária e `secondaryMessages`, não uma segunda ação `longPress`. Partir da imagem integral recém-lida e revisar mudanças de modo/sequências ocultas; o mapper atual é modo interno 3/oito grupos, sem comprovação física do gesto. Posição fixa de expressão requer CC; controle contínuo requer também uma fonte variável qualificada, hoje não oferecida por esse fluxo.

**MIDI Avançado** mantém PC/CC/canal, sequências e destinos genéricos, com comandos e limites explícitos; não libera capacidades desconhecidas. Campo/comando não reconhecido é preservado, não “corrigido”. Se o adaptador não puder preservar os dados com segurança, rejeitar o plano inteiro, sem aplicar apenas a parte suportada. Trocar equipamento não converte mensagens importadas sem revisão.

## 7. Salvar, baixar e preservar

| Ação PT / EN | Contrato |
| --- | --- |
| **Salvar no Chocolate / Save to Chocolate** | Grava configuração do controlador após revisão/cópia; não grava timbres no M5. Sucesso exige releitura. |
| **Baixar projeto / Download project** | Arquivo local editável, sem escrita física; reabrir mantém nomes e vínculos/revisões de templates. |
| **Salvar rascunho neste navegador / Save draft in this browser** | Persistência explícita em Arquivo; não é salvamento no Chocolate, nuvem ou promessa de PWA/recarga offline. |
| **Abrir projeto / Open project** | Validar arquivo não confiável, comparar e copiar antes de substituir. Cancelamento/erro mantém o anterior. |
| **Cópia do Chocolate / Chocolate backup** | FCP integral separado do JSON; importar não restaura automaticamente nem torna bytes desconhecidos editáveis. |

JSON de intenção sozinho não reconstrói bytes opacos: manter imagem integral e referências de recuperação. Não adicionar metadados de template ao JSON v1 estrito silenciosamente; domínio deve aprovar versionamento/migração. Arquivos antigos preservam comandos mesmo sem template disponível.

Diagnóstico secundário em ajuda expansível: conexão, eventos, mensagens/canal, detalhes da gravação. Não usar taxas de tráfego, hex ou contadores como entrada principal.

## 8. Direção e acessibilidade

- Vocabulário: botão, toque, segurar, preset, equipamento, cópia, grupo. Assinatura: selecionar A no controlador físico abre uma frase musical editável. Rejeitar slogans, dashboard de métricas e tabela MIDI como primeira tela.
- Reutilizar Avenir no corpo, serif apenas na marca, monoespaçada nos detalhes. Coal `#191b1c`, chassis `#101213/#272a2c`, metal `#d8dcdd`, creme `#efe8da`, âmbar `#dfb16b` para foco/seleção/ação; sem “sucesso” apenas por cor. Base 4px, corpo 16px, títulos 24px; uma ação dominante por tela.
- Controles nativos; Tab/Shift+Tab, Enter/Espaço, seleção anunciada por nome/estado. E/F fora do foco. Alvos ≥44×44px; chassis horizontal em 320px, formulários/resumos podem empilhar.
- Progresso/erros em texto e regiões anunciadas; erro associado ao campo e instrução de correção. Sem informação exclusiva de hover/toast/cor. Arquivos ocultos não criam paradas invisíveis.
- Diálogos contêm/devolvem foco; Voltar/Escape preservam rascunho, nunca gravam. PT/EN completos; contraste WCAG AA (4,5:1 texto normal, 3:1 controles/foco), zoom 200% e movimento reduzido a verificar, não presumir pelos tokens.

## 9. Validação proposta, ainda não realizada

Cinco músicos sem prática de programação MIDI para avaliação formativa, não estimativa estatística. Protótipo clicável separado testa navegação/linguagem, **não** protocolo ou saída física. Hardware real só em sessão autorizada conduzida pelo coordenador.

| Tarefa sem ensinar a solução | Limiar proposto |
| --- | --- |
| Conectar/ler e explicar o que foi verificado. | ≥4/5 em ≤2 min; ninguém confundir leitura com M5 funcionando. |
| A/toque → preset 1; A/segurar → preset 2; revisar e conferir no M5. | Meta principal ≥4/5 em ≤8 min, sem explicar PC/CC; sem ação curta indesejada ao segurar no teste físico. |
| Guardar cópia sem escrever e distinguir baixar/salvar. | ≥4/5 em ≤1 min; zero gravações não pretendidas. |
| Desconectar e retomar com leitura diferente. | ≥4/5 sem perder rascunho; zero sobrescritas silenciosas. |
| Abrir projeto, cancelar substituição, recuperar cópia. | ≥4/5 em ≤2 min; anterior intacto em todos os cancelamentos. |
| Atribuir/corrigir erro por teclado; verificar PT/EN e zoom. | Percurso sem mouse, foco preso/invisível ou erros só por cor; zero bloqueios críticos. |

Registrar tempo, ajuda solicitada, erros e interpretação dos estados. Para comparar com CubeSuite, alternar ordem das ferramentas e restaurar a mesma configuração de partida. Sem qualificação de gesto/rota, o exemplo continua proposta, não sucesso físico.

**Portão de implementação:** revisar fluxo/protótipo com o usuário; incorporar catálogo com fontes; aprovar compatibilidade dos projetos; qualificar gesto/rota e resolver diferenças de modo. Falha no experimento reabre alternativas da seção 2. Nada disso autoriza editar a aplicação nesta entrega.

[M5]: https://line6.com/data/6/0a060b316ac34f0593fa7e002/application/pdf/M5%20Pilot
[C1]: https://img1.wsimg.com/blobby/go/65f9cd9e-befb-4162-8b92-925533045e36/downloads/84a00f95-de78-441b-ab2f-017725a68e2f/Chocolate%20plus%20user%20manual26.1.8.pdf?ver=1776996614767
[C2]: https://manualf.oss-cn-hongkong.aliyuncs.com/manual/CUBE-TURNER/Chocolate%20Plus-Software%20instructions.pdf
