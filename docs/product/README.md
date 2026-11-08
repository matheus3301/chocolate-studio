# Configuração guiada — desenho e implementação

Desenho aprovado e implementado na beta.4. O protótipo abaixo permanece como registro da proposta; a aplicação real está em `apps/web`. Objetivo: uma pessoa sem prática em MIDI conecta seu Chocolate, escolhe o equipamento e configura ações musicais por botão, sem precisar traduzir PC/CC.

## Comece por aqui

| Artefato | Conteúdo |
| --- | --- |
| [Protótipo navegável](../../research/prototypes/guided-setup/index.html) · [escopo e verificação](../../research/prototypes/guided-setup/README.md) | Conexão simulada → equipamento → editor físico → revisão → teste separado. |
| [Experiência guiada](guided-experience.md) | Problemas, alternativas, telas, textos PT/EN, recuperação, acessibilidade e avaliação com iniciantes. |
| [Navegação pelo visor — correção](display-navigation.md) | Referência 000–003 → 004–007, estados piscando/fixo e edição pelos números vistos no pedal. Substitui “Banco 2” como rótulo principal. |
| [Capacidades do Chocolate](controller-capabilities.md) | Evidência própria, comportamentos, E/F por modo, preservação e critérios para testes físicos. |
| [Perfil da M5](../../research/devices/line6-m5.md) | Mapeamento completo da tabela MIDI documentada e limitações de conexão/ações. |
| [Catálogo extensível](../../research/templates/README.md) | JSON Schema, perfil bilíngue da M5 e template A/toque/segurar; contrato de pesquisa e caminho para o catálogo usado pela aplicação. |
| [Manuais preservados](../../research/manuals/README.md) | PDFs originais do Chocolate Plus e da M5 com origem e hashes. |

## Decisões de produto

- Primeiro uso guiado; retorno direto à edição com reconexão contextual. Uma tarefa principal por tela, sem slogans ou painel técnico na entrada.
- **O que você vai controlar?** → M5 inicialmente; MIDI Avançado para mensagens genéricas. Outros modelos entram por perfis declarativos com fontes próprias.
- **Um editor de ações para todos os equipamentos:** equipamento → ação → parâmetros definidos pelo perfil. O perfil adapta nomes, opções, limites e tradução MIDI; nenhum campo “Preset da M5” ou tela exclusiva por marca. A escolha inicial do wizard não impede destinos distintos nas atribuições.
- Editor centrado no desenho A/B–visor–C/D e nas ações **Ao tocar / Ao segurar**. E/F continuam representados como combinações, sem campos de atribuição nem promessa universal de navegação.
- Perfil descreve o equipamento; instância define nome/canal; template combina ações e comportamentos do controlador. Não misturar preset de áudio, grupo do Chocolate e sequência interna.
- Exemplo obrigatório: A/toque → preset 1; A/segurar → preset 2. No perfil M5 isso gera PC0/PC1. No adaptador atual, usa `shortLong`, sequência primária e secundária.
- Salvar no Chocolate, baixar projeto e preservar uma cópia integral são operações distintas. A seleção de template apenas edita o rascunho.
- M5: presets 1–24, efeito ligado/desligado, afinador entrar/sair, tap tempo e posição de expressão documentados. Parâmetros arbitrários, feedback de estado e clock não são presumidos.

## Entrega e próximos marcos

Três agentes OMP trabalharam em worktrees separadas: experiência do produto, catálogo MIDI e capacidades do controlador. O coordenador revisou a integração e criou/verificou o protótipo separado. Após a aprovação, os agentes foram retomados para catálogo/compilador, editor e conexão. A beta.4 implementa o fluxo; o [experimento 005](../../research/experiments/005-guided-actions-roundtrip.md) registra gravação, releitura e restauração reais.

1. Concluído: revisar a proposta e implementar o fluxo bilíngue aprovado.
2. Qualificar a saída real de toque/segurar e a rota até a M5, inclusive soltura, repetição e ausência de ação curta indesejada durante uma segurada. Releitura de armazenamento não comprova essas propriedades.
3. Concluído: perfis declarativos, JSONv2 com intenção e MIDI, leitura de v1, wizard e editor usando os limites observados. A navegação PC000–127 segue separada dos oito grupos Advanced programáveis.
4. Avaliar tarefas com iniciantes e comparar com CubeSuite. A melhoria de usabilidade é uma hipótese a testar, não um resultado já medido.
5. Adicionar TONEX depois de identificar e documentar o modelo exato. A referência do usuário a “ONE+” não autoriza substituí-lo por outro modelo da família.

Skills que orientaram o desenho: `opportunity-solution-tree` para resultado, oportunidades, alternativas e experimentos; `interface-design` para hierarquia, estados e edição focada. Não há dependência dessas skills no produto público.
