[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | **Español** | [Português](README.pt.md)

<p align="center">
  <h1 align="center">Claude Journal</h1>
  <p align="center">
    <strong>No es solo un visor. Habla con tu IA, edita el historial y gestiona cada conversación.</strong><br>
    <em>Para Claude Code y OpenAI Codex. Los cambios se escriben en los archivos reales.</em>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/v/claude-journal?color=c6603f&label=npm" alt="npm"></a>
    <a href="https://www.npmjs.com/package/claude-journal"><img src="https://img.shields.io/npm/dm/claude-journal?color=2f7613" alt="descargas"></a>
    <img src="https://img.shields.io/badge/node-%3E%3D18-blue" alt="node">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="licencia">
  </p>
  <p align="center">
    <a href="https://arvid-pku.github.io/claude-journal/"><strong>Guía Interactiva</strong></a> &middot;
    <a href="https://www.npmjs.com/package/claude-journal">npm</a> &middot;
    <a href="https://github.com/Arvid-pku/claude-journal/releases">Versiones</a>
  </p>
</p>

<p align="center">
  <img src="figures/mainpage.png" alt="Claude Journal — Inicio" width="800">
</p>

## Inicio Rápido

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

Luego abre [http://localhost:5249](http://localhost:5249). Encuentra automáticamente tus directorios `~/.claude/projects` y `~/.codex/sessions`.

Después de reiniciar, simplemente ejecuta el mismo comando de nuevo — no es necesario reinstalar.

---

## Esto No Es Solo un Visor

La mayoría de las herramientas de historial de conversaciones son de solo lectura. Claude Journal es diferente:

### Habla Directamente desde el Navegador

<p align="center">
  <img src="figures/Talk.png" alt="Chatea con Claude Code desde el navegador" width="700">
</p>

Escribe un mensaje en el cuadro de entrada flotante y Claude Code (o Codex) **retoma la conversación exacta** — misma sesión, mismo contexto. La respuesta se transmite en tiempo real mediante el observador de archivos en vivo. No necesitas terminal.

### Edita Tu Historial Real

<p align="center">
  <img src="figures/Session Introduction.jpg" alt="Vista de sesión con anotaciones y edición" width="800">
</p>

Cada cambio se escribe en los archivos reales del disco:

| Acción | Qué sucede |
|--------|------------|
| **Renombrar sesión** | Escribe `custom-title` en el JSONL. `claude --resume "nuevo-nombre"` lo detecta inmediatamente. |
| **Editar mensaje** | Actualiza el contenido del mensaje en el archivo JSONL. Modifica prompts, corrige errores tipográficos, limpia conversaciones. |
| **Eliminar mensaje** | Elimina la línea del JSONL. Borra permanentemente ese mensaje del historial. |
| **Duplicar sesión** | Crea un nuevo archivo JSONL — una copia completa con la que puedes experimentar. |
| **Mover sesión** | Mueve el JSONL entre directorios de proyecto (con detección de colisiones). |

Todas las escrituras son atómicas (archivo temporal + renombrado) — seguras incluso mientras Claude Code está escribiendo activamente en el mismo archivo.

---

## Características

### Anotaciones

Marca con estrella, resalta (5 colores), comenta, etiqueta y fija cualquier mensaje o sesión. Comentarios laterales estilo Google Docs con guardado automático. Explora todas las anotaciones entre sesiones en la barra lateral (Destacados / Resaltados / Notas / Etiquetas). Las anotaciones se almacenan por separado — tus archivos JSONL se mantienen limpios.

### Panel de Analíticas

<p align="center">
  <img src="figures/Analytics.png" alt="Panel de analíticas" width="600">
</p>

Gráficos diarios de costos y tokens, mapas de calor de actividad, desglose de uso de herramientas, distribución de modelos, sesiones principales por costo. Filtra por rango de fechas y por proyecto. Funciona tanto con Claude Code como con Codex.

### Visualización Inteligente

- **Vista de diferencias para llamadas Edit** — diff unificado rojo/verde en lugar de texto antiguo/nuevo sin formato
- **Agrupación de llamadas a herramientas** — 3+ herramientas consecutivas colapsadas en un resumen
- **Línea temporal de sesión** — tarjeta resumen mostrando el primer prompt, archivos tocados, barras de uso de herramientas
- **Botones de copiar código** — copia con un clic en cada bloque de código
- **Expansión de subagentes** — visualiza conversaciones anidadas de Agent en línea
- **Filtros por tipo de mensaje** — alterna entre Human, Assistant, Tool Calls, Thinking, y tipos de herramientas específicos
- **Mensajes colapsables** — pliega mensajes largos haciendo clic en el encabezado

### Soporte Multi-Proveedor

Claude Code y OpenAI Codex en una interfaz unificada. Secciones de proveedores colapsables en la barra lateral. Haz clic derecho en carpetas de proyecto para fijarlas u ocultarlas. Filtra por proveedor en Configuración.

### Gestión de Sesiones

Haz clic derecho en cualquier sesión: Fijar, Renombrar, Duplicar, Mover, Eliminar, Seleccionar Múltiples (eliminación por lotes). Haz clic derecho en carpetas de proyecto: Fijar arriba, Ocultar.

### Atajos de Teclado

Presiona `?` para ver la lista completa. Destacados: `/` buscar, `j/k` navegar, `Ctrl+E` exportar, `Ctrl+B` barra lateral, `g+a` analíticas.

### Exportación

Markdown o HTML autónomo (con CSS en línea, compartible con cualquier persona).

### Todo Es Configurable

Cada característica se puede desactivar en Configuración. Los usuarios que prefieren simplicidad pueden desactivar avatares, línea temporal, vista de diferencias, agrupación de herramientas, botones de copiar código, etiquetas y más.

---

## Instalación

### Instalación Global (recomendada)

```bash
npm install -g claude-journal
claude-journal --daemon --port 5249
```

### Otras Opciones

```bash
npx claude-journal                          # Ejecutar directamente sin instalar
claude-journal --daemon                     # Modo en segundo plano (puerto predeterminado 8086)
claude-journal --status                     # Verificar: Running (PID 12345) at http://localhost:5249
claude-journal --stop                       # Detener el daemon
```

Para inicio automático al iniciar sesión:
```bash
pm2 start claude-journal -- --daemon --no-open --port 5249
pm2 save && pm2 startup
```

### Aplicación de Escritorio

Descarga [AppImage / DMG / EXE](https://github.com/Arvid-pku/claude-journal/releases) desde GitHub Releases.

> **Usuarios de macOS:** La aplicación no está firmada digitalmente. macOS mostrará _"dañada"_. Solución:
> ```bash
> xattr -cr "/Applications/Claude Journal.app"
> ```

<details>
<summary>Docker / desde el código fuente</summary>

```bash
# Desde el código fuente
git clone https://github.com/Arvid-pku/claude-journal.git
cd claude-journal && npm install && npm start

# Docker
docker build -t claude-journal .
docker run -v ~/.claude/projects:/data -p 5249:5249 -e PORT=5249 claude-journal
```
</details>

### Acceso Remoto

```bash
# Túnel SSH (recomendado):
ssh -L 5249:localhost:5249 user@server

# O con autenticación para acceso directo:
claude-journal --daemon --auth user:pass --port 5249
```

VS Code Remote SSH reenvía puertos automáticamente — simplemente ejecuta `claude-journal` en la terminal.

---

## Arquitectura

```
claude-journal/
  server.js                Servidor Express + WebSocket (chat, anotaciones, analíticas)
  bin/cli.js               CLI con modo daemon, verificación de Node 18+
  providers/
    codex.js               Proveedor Codex (lee ~/.codex/, SQLite + JSONL)
  public/
    modules/               Módulos ES en Vanilla JS (sin paso de compilación)
      main.js              Inicio de la app, enrutamiento, chat, atajos de teclado
      messages.js           Renderizado, vista de diferencias, línea temporal, agrupación de herramientas, etiquetas
      sidebar.js           Lista de sesiones, gestión de proyectos, operaciones masivas
      analytics.js         Gráficos, mapas de calor, panel de proyecto
      search.js            Búsqueda global con filtros
      state.js             Estado compartido, utilidades, algoritmo de diferencias
  tray/                    Aplicación de bandeja del sistema Electron (opcional)
  tests/                   Pruebas E2E con Playwright
```

**Sin paso de compilación.** Vanilla JS puro con módulos ES. Sin React, sin bundler, sin transpilador.

---

## Cómo Funciona

1. **El servidor** escanea `~/.claude/projects/` y `~/.codex/sessions/` en busca de conversaciones
2. **El proveedor Codex** normaliza los eventos de Codex (`function_call`, `reasoning`, etc.) al formato de Claude
3. **WebSocket** observa los archivos de sesión activos para actualizaciones en vivo, y canaliza los mensajes del chat hacia el CLI de `claude`/`codex`
4. **Las anotaciones** se almacenan por separado en `annotations/` — nunca modifica los archivos de conversación a menos que edites/elimines explícitamente
5. **El chat** ejecuta `claude --resume <id> --print` o `codex exec resume <id> --json` como un subproceso
6. **Todas las ediciones** usan escrituras atómicas para prevenir corrupción por acceso concurrente

---

## Limitaciones Conocidas y Ayuda Solicitada

Claude Journal es un proyecto personal que se convirtió en algo útil. Hay aspectos por pulir:

| Limitación | Detalles |
|-----------|---------|
| **Sin edición de mensajes de Codex** | El formato JSONL de Codex (wrappers `event_msg`/`response_item`) es diferente al de Claude. La edición/eliminación de mensajes individuales de Codex aún no está implementada. |
| **La estimación de costos es aproximada** | Muestra el costo equivalente de la API (tokens de entrada + salida). Los tokens de caché se excluyen. La facturación real depende de tu plan de suscripción. |
| **Sin diseño para móviles** | La interfaz es solo para escritorio. La barra lateral no se adapta a pantallas pequeñas. |
| **Aplicación de escritorio sin firmar** | macOS requiere `xattr -cr` para abrir. La firma digital apropiada necesita un certificado de Apple Developer ($99/año). |
| **Solo usuario único** | Sin cuentas de usuario, sin soporte multi-inquilino. Diseñado para uso personal en tu propia máquina. |
| **Actualizaciones en vivo inestables durante ediciones** | El observador de archivos WebSocket puede ocasionalmente reconstruir el DOM mientras estás interactuando con un mensaje. |

**¡Las contribuciones son bienvenidas!** Si deseas ayudar con cualquiera de estos temas, abre un issue o PR en [github.com/Arvid-pku/claude-journal](https://github.com/Arvid-pku/claude-journal).

Ideas que sería genial tener:

- Diseño responsive para móviles
- Soporte de edición de mensajes de Codex
- Firma de código de Apple para el .dmg
- Más proveedores (Cursor, Windsurf, Aider, etc.)
- Comparación de sesiones (diff lado a lado de dos conversaciones)
- Resumen de conversaciones (resúmenes de sesión generados automáticamente)

---

## Requisitos

- **Node.js** 18 o posterior
- **Claude Code** (`~/.claude/projects/`) y/o **OpenAI Codex** (`~/.codex/sessions/`)

## Licencia

MIT

---

<p align="center">
  Creado por <a href="https://github.com/Arvid-pku">Xunjian Yin</a>
</p>
