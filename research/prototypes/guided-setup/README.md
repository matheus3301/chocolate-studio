# Protótipo da configuração guiada

Artefato de pesquisa para revisar o fluxo antes de editar a aplicação. Abra `index.html` em um navegador ou sirva a raiz do repositório e acesse `/research/prototypes/guided-setup/`.

## Percurso

1. Simular busca e leitura do Chocolate.
2. Escolher M5 ou MIDI Avançado e confirmar o canal.
3. Selecionar A no desenho; habilitar outra ação ao segurar; escolher preset 1 ao tocar e preset 2 ao segurar.
4. Revisar as ações, simular gravação e explorar a orientação para o teste físico.

O exemplo inicial usa presets 1–4 nos botões. Esses valores são fictícios: a implementação deve partir da leitura real e preservar atribuições existentes. A representação do controlador indica o botão **em edição**, não estado físico.

## Limites deliberados

- Nenhum Web MIDI, acesso ao pedal, rede, persistência ou dependência da aplicação. Recarregar descarta o estado de demonstração.
- Interface apenas em português nesta maquete; a especificação e o catálogo incluem PT-BR e inglês. A implementação exige ambos.
- Um grupo e um equipamento por vez. M5 e Avançado conservam rascunhos separados em memória. Não é o contrato final de migração de projetos.
- CC no Avançado usa valor fixo 127, explicitamente indicado. O produto terá controle e valor editáveis.
- A busca/leitura é simulada. O produto exige confirmação das portas, identidade, leitura integral, cópia recuperável e comparação antes de gravar.
- Reconectar passa pela escolha de equipamento nesta demonstração. O produto deve retornar ao editor após reconciliar a nova leitura.
- Revisão mostra o exemplo completo, sem comparação de bytes ou ativação de modo. Importação/exportação, backups, erros de escrita e conflitos estão especificados, mas não implementados aqui.
- O cartão TONEX não é selecionável. A tela final deve listar somente perfis disponíveis; pesquisar o modelo exato antes de adicioná-lo.
- Expressão é uma posição fixa de CC1 nas atribuições previamente preparadas na M5; não um pedal de expressão contínuo.
- Tocar/segurar e resposta da M5 ainda exigem qualificação física. A simulação não produz evidência de funcionamento do hardware.

## Verificação do coordenador — 2026-11-08

Percurso exercitado no navegador do Codex: conexão simulada → M5 → A/preset 1 + segurar/preset 2 → revisão → gravação simulada → teste separado. Conferidos também o caminho Avançado, foco por teclado, rejeição nativa de preset 25, preservação das ações após desconexão e reconexão e bloqueio da revisão enquanto desconectado.

Em viewport 390×844 não houve transbordamento horizontal; os quatro alvos físicos mediram aproximadamente 65×78px. Isso não substitui auditoria completa de acessibilidade, testes de leitor de tela, contraste/zoom ou pesquisa com músicos iniciantes.

O [brief do produto](../../../docs/product/guided-experience.md) e os [limites do controlador](../../../docs/product/controller-capabilities.md) são a especificação para implementação; esta maquete é um subconjunto ilustrativo.
