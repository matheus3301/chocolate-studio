# Navegação pelos números do visor

Correção de produto em 2026-11-08: a referência de navegação deve corresponder ao que o músico vê no Chocolate. **“Banco 2 · A” não é o rótulo principal adequado para a operação numérica relatada.** Este documento substitui essa recomendação anterior; não altera a aplicação nem comprova capacidades novas do protocolo.

## Evidência de uso

Relato direto de operação fornecido pelo usuário nesta revisão; não captura automatizada nem teste realizado pelo agente:

| Ação na sequência relatada | Visor | Próximas escolhas A / B / C / D |
| --- | --- | --- |
| Tocar A, B, C, D | 000, 001, 002, 003, respectivamente | 000 / 001 / 002 / 003 |
| Depois de D, pressionar F = C+D | 007 piscando | 004 / 005 / 006 / 007 |
| Tocar A, B, C, D novamente | 004, 005, 006, 007 fixos | 004 / 005 / 006 / 007 |
| Depois de D, pressionar F novamente | 011 piscando | 008 / 009 / 010 / 011 |
| Tocar A, B, C, D novamente | 008, 009, 010, 011 fixos | 008 / 009 / 010 / 011 |

O [manual preservado, PDF p.2](../../research/manuals/chocolate-plus-user-manual-2026-01-08.pdf) documenta PC0–127, troca de grupos por E/F e exibição do código PC. O relato é compatível com essa apresentação, mas modo e opções de display não foram lidos nesta revisão. São 128 valores de 000 a 127 no modo documentado; o limite físico e a volta nas extremidades ainda precisam ser exercitados.

Detalhe importante: **D precedeu F nas duas sequências**. Não concluir que F sempre exibe o último número do conjunto. Pode haver retenção da coluna anteriormente escolhida; testar F a partir de A/B/C antes de generalizar. O relato também não demonstra se F emite MIDI, se apenas prepara a seleção, nem qual mensagem acompanha o piscar.

Busca complementar encontrou [uma apresentação do Chocolate Plus identificada como M-VAVE](https://www.bilibili.com/video/BV1xM4m127J8/), mas a consulta retornou HTTP412; o conteúdo audiovisual não foi verificado. Não usar esse vídeo como comprovação da sequência. A referência concreta para os estados piscando/fixo acima é o relato do usuário.

## Apresentação proposta

Intenção: músico olhando alternadamente para o controlador e a tela deve localizar a mesma escolha sem traduzir um número de banco inventado pela interface.

```text
Números no Chocolate       [ Anteriores ]  004–007  [ Próximos ]

      A          B            visor             C          D
     004        005        [prévia da edição]   006        007

Editando 004 · botão A
Equipamento: M5
Ao tocar: Selecionar preset [5]
Ao segurar: [Adicionar ação, quando suportada]
```

- Letras permanecem junto dos botões físicos; números de três dígitos identificam as escolhas naquela apresentação. O intervalo é um auxílio de navegação da interface, não algo que o display físico mostra simultaneamente.
- Exibir resumo musical junto de cada escolha; selecionar uma abre seu editor. Não mostrar 128 formulários de uma vez.
- “Anteriores / Próximos” navega a edição local. A ajuda explica E=A+B e F=C+D para operação física quando confirmada no modo em uso. Clicar na interface não pressiona o pedal nem envia MIDI.
- Usar **“004 · botão A” / “004 · switch A”** e **“Números no Chocolate” / “Numbers on Chocolate”**. Não exigir que o usuário conheça o índice interno de grupo.
- Separar **“No Chocolate: 004” / “On Chocolate: 004”** de **“Na M5: preset 5” / “On M5: preset 5”**. Este exemplo é a correspondência documentada PC4→preset5; não significa que o editor já possa reprogramar livremente cada posição do modo PC.
- Um modo personalizado pode mostrar o comando atribuído, outro formato ou outro número. Antes de usar “004” como identidade de uma atribuição personalizável, qualificar como esse display se comporta após mudar a mensagem. Não prometer que 004 continuará aparecendo se essa ação virar afinador.
- A maquete atual de quatro atribuições continua um recorte insuficiente dessa navegação. Precisa ser revisada antes de ser tomada como desenho final; esta correção não implementa um editor de 128 posições.

## Estados distintos

| Estado | O que significa na interface |
| --- | --- |
| Intervalo em edição | As quatro escolhas que o usuário está examinando no aplicativo. |
| Atribuição selecionada | A escolha aberta para edição, por exemplo 004/A. |
| Número físico fixo observado | Informação do controlador somente quando houver observação confiável; não deduzir da seleção local. |
| Número físico piscando observado | Estado separado de navegação, com indicação textual “Escolha um botão / Choose a switch”; não tratá-lo como ação executada no destino. |
| Último comando recebido | Evidência MIDI que pode ajudar a localizar candidatos; não identifica necessariamente um único botão, gesto ou estado do visor. |

Sem telemetria confiável, mostrar apenas **prévia da edição**, sem espelhamento fictício. Não reproduzir piscadas como único indicador; manter texto acessível e respeitar movimento reduzido. A frase “Escolha um botão” é ajuda de UX baseada na sequência, não prova de ausência de emissão MIDI durante F.

Internamente, separar localização lógica no modo, botão físico, gesto, conteúdo do comando e formato/valor do display. O número renderizado não é chave global estável entre modos, perfis ou configurações. A quantidade de posições e a possibilidade de editar toque/segurar continuam dependentes das capacidades reais: navegar PC0–127 não comprova 128 atribuições personalizáveis nem compatibilidade com o layout avançado já mapeado.

## Critérios para a próxima revisão

1. Reproduzir a sequência relatada no modelo de navegação: 000–003 → 004–007 → 008–011, preservando a distinção entre prévia local e visor observado.
2. Uma pessoa que vê 006 no pedal deve localizar “006 · C” na tela sem calcular um banco.
3. Investigar com o controlador: F partindo de A/B/C/D; E; repetição; extremidades; valores fixos/piscando; emissão MIDI durante a mudança; opções de display e modo exato.
4. Qualificar o display nos modos que permitem atribuições musicais e toque/segurar antes de combinar essas capacidades com a navegação numérica.
5. Validar com iniciantes se número do Chocolate e preset do equipamento são compreendidos como informações diferentes.
