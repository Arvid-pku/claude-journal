[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | **Português**

<p align="center">
  <h1 align="center">Claude Journal</h1>
  <p align="center">
    <strong>Não é apenas um visualizador. Converse com sua IA, edite o histórico e gerencie todas as conversas.</strong><br>
    <em>Para Claude Code e OpenAI Codex. As alterações são gravadas nos arquivos reais.</em>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/v/claude-journal?color=c6603f&label=npm" alt="npm"></a>
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/dm/claude-journal?color=2f7613" alt="downloads"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-blue" alt="node">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  </p>
  <p align="center">
    <a href="https://arvid-pku.github.io/claude-journal/"><strong>Guia Interativo</strong></a> &middot;
    <a href="https://www.npmjs.com/package/claude-journal">npm</a> &middot;
    <a href="https://github.com/Arvid-pku/claude-journal/releases">Releases</a>
  </p>
</p>

<p align="center">
  <img src="figures/mainpage.png" alt="Claude Journal — Página Inicial" width="800">
</p>

## Início Rápido

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

Em seguida, abra [http://localhost:5249](http://localhost:5249). Ele encontra automaticamente seus diretórios `~/.claude/projects` e `~/.codex/sessions`.

Após uma reinicialização, basta executar o mesmo comando novamente — não é necessário reinstalar.

---

## Isto Não É Apenas um Visualizador

A maioria das ferramentas de histórico de conversas é somente leitura. Claude Journal é diferente:

### Converse Diretamente pelo Navegador

<p align="center">
  <img src="figures/Talk.png" alt="Converse com Claude Code pelo navegador" width="700">
</p>

Digite uma mensagem na caixa de entrada flutuante e o Claude Code (ou Codex) **retoma a conversa exata** — mesma sessão, mesmo contexto. A resposta é transmitida em tempo real pelo observador de arquivos ao vivo. Sem necessidade de terminal.

### Edite Seu Histórico Real

<p align="center">
  <img src="figures/Session Introduction.jpg" alt="Visualização de sessão com anotações e edição" width="800">
</p>

Cada alteração é gravada nos arquivos reais em disco:

| Ação | O que acontece |
|------|----------------|
| **Renomear sessão** | Grava `custom-title` no JSONL. `claude --resume "novo-nome"` o reconhece imediatamente. |
| **Editar mensagem** | Atualiza o conteúdo da mensagem no arquivo JSONL. Altere prompts, corrija erros de digitação, limpe conversas. |
| **Excluir mensagem** | Remove a linha do JSONL. Apaga permanentemente aquela mensagem do histórico. |
| **Duplicar sessão** | Cria um novo arquivo JSONL — uma cópia completa para você experimentar. |
| **Mover sessão** | Move o JSONL entre diretórios de projeto (com detecção de conflitos). |

Todas as gravações são atômicas (arquivo temporário + renomeação) — seguro mesmo enquanto o Claude Code está escrevendo ativamente no mesmo arquivo.

---

## Funcionalidades

### Anotações

Marque com estrela, destaque (5 cores), comente, adicione tags e fixe qualquer mensagem ou sessão. Comentários laterais no estilo Google Docs com salvamento automático. Navegue por todas as anotações entre sessões na barra lateral (Com estrela / Destaques / Notas / Tags). As anotações são armazenadas separadamente — seus arquivos JSONL permanecem limpos.

### Painel de Análises

<p align="center">
  <img src="figures/Analytics.png" alt="Painel de análises" width="600">
</p>

Gráficos diários de custo e tokens, mapas de calor de atividade, detalhamento do uso de ferramentas, distribuição de modelos, principais sessões por custo. Filtre por intervalo de datas e por projeto. Funciona tanto com Claude Code quanto com Codex.

### Exibição Inteligente

- **Visualização de diff para chamadas de edição** — diff unificado vermelho/verde em vez de texto bruto antigo/novo
- **Agrupamento de chamadas de ferramentas** — 3+ ferramentas consecutivas recolhidas em um resumo
- **Linha do tempo da sessão** — card de visão geral mostrando o primeiro prompt, arquivos modificados, barras de uso de ferramentas
- **Botões de copiar código** — cópia com um clique em cada bloco de código
- **Expansão de subagentes** — visualize conversas aninhadas de Agent inline
- **Filtros por tipo de mensagem** — alterne entre Humano, Assistente, Chamadas de Ferramentas, Pensamento e tipos específicos de ferramentas
- **Mensagens recolhíveis** — recolha mensagens longas clicando no cabeçalho

### Suporte a Múltiplos Provedores

Claude Code e OpenAI Codex em uma interface unificada. Seções de provedores recolhíveis na barra lateral. Clique com o botão direito em pastas de projeto para fixar ou ocultar. Filtre por provedor em Configurações.

### Gerenciamento de Sessões

Clique com o botão direito em qualquer sessão: Fixar, Renomear, Duplicar, Mover, Excluir, Selecionar Múltiplas (exclusão em lote). Clique com o botão direito em pastas de projeto: Fixar no topo, Ocultar.

### Atalhos de Teclado

Pressione `?` para a lista completa. Destaques: `/` pesquisar, `j/k` navegar, `Ctrl+E` exportar, `Ctrl+B` barra lateral, `g+a` análises.

### Exportação

Markdown ou HTML autocontido (com CSS inline, compartilhável com qualquer pessoa).

### Tudo É Configurável

Cada funcionalidade pode ser desativada em Configurações. Usuários que preferem simplicidade podem desativar avatares, linha do tempo, visualização de diff, agrupamento de ferramentas, botões de copiar código, tags e muito mais.

---

## Instalação

### Instalação Global (recomendada)

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

### Outras Opções

```bash
npx claude-journal                          # Executar diretamente sem instalar
claude-journal --daemon                     # Modo em segundo plano (porta padrão 8086)
claude-journal --status                     # Verificar: Running (PID 12345) at http://localhost:5249
claude-journal --stop                       # Parar o daemon
```

Para iniciar automaticamente no login:
```bash
pm2 start claude-journal -- --daemon --no-open --port 5249
pm2 save && pm2 startup
```

### Aplicativo Desktop

Baixe [AppImage / DMG / EXE](https://github.com/Arvid-pku/claude-journal/releases) no GitHub Releases.

> **Usuários macOS:** O aplicativo não é assinado digitalmente. O macOS exibirá _"danificado"_. Solução:
> ```bash
> xattr -cr "/Applications/Claude Journal.app"
> ```

<details>
<summary>Docker / a partir do código-fonte</summary>

```bash
# A partir do código-fonte
git clone https://github.com/Arvid-pku/claude-journal.git
cd claude-journal && npm install && npm start

# Docker
docker build -t claude-journal .
docker run -v ~/.claude/projects:/data -p 5249:5249 -e PORT=5249 claude-journal
```
</details>

### Acesso Remoto

```bash
# Túnel SSH (recomendado):
ssh -L 5249:localhost:5249 user@server

# Ou com autenticação para acesso direto:
claude-journal --daemon --auth user:pass --port 5249
```

O VS Code Remote SSH encaminha portas automaticamente — basta executar `claude-journal` no terminal.

---

## Arquitetura

```
claude-journal/
  server.js                Servidor Express + WebSocket (chat, anotações, análises)
  bin/cli.js               CLI com modo daemon, verificação de Node 18+
  providers/
    codex.js               Provedor Codex (lê ~/.codex/, SQLite + JSONL)
  public/
    modules/               Módulos ES em Vanilla JS (sem etapa de build)
      main.js              Inicialização do app, roteamento, chat, atalhos de teclado
      messages.js           Renderização, visualização de diff, linha do tempo, agrupamento de ferramentas, tags
      sidebar.js           Lista de sessões, gerenciamento de projetos, operações em lote
      analytics.js         Gráficos, mapas de calor, painel de projetos
      search.js            Pesquisa global com filtros
      state.js             Estado compartilhado, utilitários, algoritmo de diff
  tray/                    Aplicativo de bandeja do sistema Electron (opcional)
  tests/                   Testes E2E com Playwright
```

**Sem etapa de build.** Vanilla JS puro com ES modules. Sem React, sem bundler, sem transpilador.

---

## Como Funciona

1. **Servidor** varre `~/.claude/projects/` e `~/.codex/sessions/` em busca de conversas
2. **Provedor Codex** normaliza eventos do Codex (`function_call`, `reasoning`, etc.) para o formato do Claude
3. **WebSocket** observa arquivos de sessão ativos para atualizações ao vivo e encaminha mensagens de chat para o CLI `claude`/`codex`
4. **Anotações** armazenadas separadamente em `annotations/` — nunca modifica arquivos de conversa a menos que você edite/exclua explicitamente
5. **Chat** inicia `claude --resume <id> --print` ou `codex exec resume <id> --json` como subprocesso
6. **Todas as edições** usam gravações atômicas para evitar corrupção por acesso concorrente

---

## Limitações Conhecidas e Contribuições Desejadas

Claude Journal é um projeto paralelo que cresceu e se tornou algo útil. Existem arestas a serem aparadas:

| Limitação | Detalhes |
|-----------|----------|
| **Sem edição de mensagens do Codex** | O formato JSONL do Codex (wrappers `event_msg`/`response_item`) é diferente do formato do Claude. A edição/exclusão de mensagens individuais do Codex ainda não foi implementada. |
| **Estimativa de custo é aproximada** | Mostra o custo equivalente da API (tokens de entrada + saída). Tokens de cache são excluídos. O faturamento real depende do seu plano de assinatura. |
| **Sem layout mobile** | A interface é apenas para desktop. A barra lateral não se adapta a telas pequenas. |
| **Aplicativo desktop não assinado** | O macOS requer `xattr -cr` para abrir. A assinatura digital adequada exige um certificado Apple Developer (US$ 99/ano). |
| **Apenas usuário único** | Sem contas de usuário, sem suporte multi-tenant. Projetado para uso pessoal na sua própria máquina. |
| **Atualizações ao vivo instáveis durante edições** | O observador de arquivos WebSocket pode ocasionalmente reconstruir o DOM enquanto você está interagindo com uma mensagem. |

**Contribuições são bem-vindas!** Se você gostaria de ajudar com algum desses itens, abra uma issue ou PR em [github.com/Arvid-pku/claude-journal](https://github.com/Arvid-pku/claude-journal).

Ideias que seriam ótimas de implementar:
- Layout responsivo para dispositivos móveis
- Suporte à edição de mensagens do Codex
- Assinatura digital Apple para o .dmg
- Mais provedores (Cursor, Windsurf, Aider, etc.)
- Comparação de sessões (diff lado a lado de duas conversas)
- Resumo de conversas (resumos de sessão gerados automaticamente)

---

## Requisitos

- **Node.js** 18 ou superior
- **Claude Code** (`~/.claude/projects/`) e/ou **OpenAI Codex** (`~/.codex/sessions/`)

## Licença

MIT

---

<p align="center">
  Desenvolvido por <a href="https://github.com/Arvid-pku">Xunjian Yin</a>
</p>
