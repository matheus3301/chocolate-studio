# Chocolate Studio — decisões da interface

Revisão aprovada para implementação em 2026-11-08, condicionada a escolhas justificadas e hierarquia coerente. Fonte: feedback direto do usuário neste chat; pesquisa em docs/product/ui-reset-proposal.md.

## Intenção e domínio

Músico iniciante em MIDI, diante de um controlador físico, precisa escolher o resultado de um botão e salvar. Sensação: ferramenta tranquila, direta e previsível. Domínio: footswitch, gesto, visor numérico, sequência, canal, equipamento, mensagem, recuperação. Cores naturais: alumínio, borracha preta, papel do manual, LED âmbar, verde de sinal. Assinatura: A–B / visor / C–D ligado espacialmente ao editor do botão.

Evitar defaults: sidebar de módulos, dashboard de cartões iguais, slogans, wizard obrigatório, menus sinônimos e avisos técnicos constantes.

## Hierarquia e justificativas

- Idioma direto no cabeçalho, Português / English em nomes próprios: precisa ser reconhecível inclusive quando o texto atual não é compreendido. Sem engrenagem contendo uma única opção; bandeiras não são o único rótulo porque representam países.
- Arquivo é a única ferramenta de documentos no topo: abrir, baixar cópia, recuperar. Não usar “Configurações” para significar arquivos. Sem nome obrigatório de pedalboard/projeto.
- Conexão tem estado curto e uma ação para conectar/reconectar. Descoberta inicial e leitura são automáticas quando permitidas, pois são trabalho do aplicativo. Portas individuais são solução de ambiguidade, não requisito universal.
- Modo fica junto do Chocolate: afeta o controlador inteiro e deve ser visível antes de editar. Trocar exige explicar mudanças de comportamento; nunca confundir 128 números fixos com atribuições livres.
- Pedal externo e opções do controlador ficam junto ao modo, com nomes concretos. Canal de uma ação fica junto do destino dessa ação; não aplicar um canal global a mensagens que possuem canal próprio.
- Controlador e resumo A–D são a visão geral; painel adjacente é a edição. Não duplicar o controlador dentro de detalhes avançados.
- Gesto → equipamento → ação → parâmetro, porque descreve a intenção antes de sua codificação MIDI. Mostrar só campos necessários para a ação. Perfil genérico fornece vocabulário e limites.
- Campos válidos atualizam a edição; nenhum “Aplicar ao rascunho” adicional. Campos incompletos mostram erro e impedem gravação/perda silenciosa.
- Um Salvar no Chocolate persistente: gravação é deliberada e tem destino explícito. Backup e releitura são automáticos. Revisão adicional só quando há substituição, mudança de modo ou conflito significativo.
- Arquivo e recuperação não gravam no pedal por consequência. Estado “salvo” exige leitura exata; diagnóstico e confirmação física são distintos e opcionais na área apropriada.

## Sistema visual

Hierarquia: controlador + botão selecionado como foco; ação Salvar consistente; ferramentas auxiliares com menos peso. Fundo papel #f4f3ef, painel #fffefa, texto #272b2a, secundário #606964, borda #d8dcd5, âmbar #e9b34e para seleção/ação, verde #356749 para estado verificado. Cor nunca é o único indicador.

Profundidade: superfícies claras e bordas sutis; sombra apenas no objeto físico e diálogos. Tipografia de sistema para legibilidade; corpo 14–16px, títulos 20–26px; mono só números/protocolo. Escala espacial base 4px, campos com 8px entre rótulo e controle, painéis 16–24px, grupos independentes 24px. Controles pelo menos 44px de altura; foco visível de 3px.

Desktop: duas colunas, objeto e inspector. Estreito: objeto antes do inspector; alvos físicos >=44px, texto com quebra, nenhuma largura mínima que gere overflow. Barra de gravação não cobre o último campo: reservar espaço e testar rolagem/teclado/zoom. Menus e diálogos nativos/controles já existentes, foco devolvido ao acionador.

## Aceitação

PT/EN sem reconectar ou perder campos; fluxo sem wizard obrigatório; todos os 13 modos acessíveis; mesma semântica preservada em Advanced/Mix/teclado; erros recuperáveis; sem escrita automática; 320/390/830/1280px e zoom; nomes longos e erros visíveis; nenhum campo suportado perdido na migração. Qualificação técnica não é aprovação de usabilidade.
