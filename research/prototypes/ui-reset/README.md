# Proposta de reconstrução da interface — 8 novembro 2026

**Proposta para revisão, não implementação aprovada.** A aplicação de produção permanece inalterada.

Abra `index.html` por um servidor local. O protótipo é independente da aplicação: não pede permissão MIDI, não conecta ao pedal, não grava arquivos do usuário e não envia dados. Todas as conexões, leituras, gravações e falhas são simulações identificadas na faixa superior. Recarregar descarta as alterações.

- **Protótipo**: editor, primeira conexão, presets sequenciais, troca contextual de modo, toque/segurar, equipamento e ação, configurações e recuperação de erros.
- **Fluxos e decisões**: mapa navegável na própria página.
- **Pesquisa**: comparação de cinco editores com fontes oficiais.
- **Cenários**: seletor na faixa de avaliação; fica fora da interface proposta do produto.
- **Especificação completa**: [ui-reset-proposal.md](../../../docs/product/ui-reset-proposal.md).

O protótipo detalha os modos PC sequencial e MIDI personalizável. Os demais modos têm requisitos definidos na especificação; o desenho final de teclado, Mix e controles especiais ainda exige uma rodada específica. Não são funcionalidades declaradas como implementadas. A internacionalização está especificada, mas esta maquete é em português.

## Revisão sugerida

1. Em **Primeiro acesso**, conecte e observe quantos passos existem até o controlador.
2. Clique em A e depois em **Personalizar este botão**. Leia a consequência global da mudança de modo.
3. No editor personalizável, configure **Ao tocar → Selecionar preset → 1** e **Ao segurar → Selecionar preset → 2**. Veja o resumo junto ao controlador.
4. Salve. O editor permanece aberto; a mensagem de estado muda no mesmo lugar.
5. Troque para **Portas ambíguas**, **Desconectado** e **Conflito ao salvar** pelo seletor de cenários.
6. Abra **Configurações** e **Ajustes**: avalie se essas ferramentas continuam fáceis de encontrar sem competir com editar A–D.
7. Repita em uma janela estreita. O painel de edição fica abaixo do controlador.

## Intenção visual

Pessoa: músico com pouca familiaridade com MIDI. Tarefa: apontar um botão e escolher um resultado no equipamento. Sensação: ferramenta clara e tranquila, sem linguagem promocional.

Domínio: footswitch, gesto, visor numérico, sequência, canal MIDI, ação musical, equipamento de destino. Cores do ambiente: alumínio escovado, borracha preta, papel de manual, LED âmbar, verde de sinal. Assinatura: controlador físico escuro sobre uma superfície clara, com a ação de cada botão imediatamente abaixo.

Escolhas: fundo de trabalho claro e neutro; um destaque âmbar para seleção; tipografia de sistema legível; números monoespaçados só onde úteis; bordas discretas; nenhuma barra lateral de módulos, banner de marketing ou coleção de cards decorativos. A maquete explora hierarquia e fluxo, não tenta substituir a ilustração atual já aprovada pelo usuário.

## Verificação da maquete

Revisão no navegador: conexão simulada abre o editor; transição de PC fixo para ações personalizadas explica o alcance; edição de segurar atualiza o resumo e o salvamento simulado mantém a tela; diálogo de conflito aparece antes de qualquer sucesso. Escape fecha o diálogo e devolve foco ao acionador. Dimensões avaliadas: 320, 390, 830 e 1280 px. A inspeção de 320 px encontrou um excesso de largura no cabeçalho, corrigido com quebra das ferramentas; editor e seleção de dispositivos ficaram sem overflow horizontal nessa largura. A ilustração mantém alvos de switches acima de 44 px.

Isso é QA da maquete, não validação de usabilidade, auditoria completa de acessibilidade ou teste de integração com o Chocolate. A revisão com iniciantes, inglês, zoom e todos os modos continua como critério da implementação futura.
