# Retro Terminal Theme System

**Date:** 2026-04-14
**Status:** Design approved
**Scope:** Terminal instances only — per-terminal theme, effects, and chrome styling

## Problem Statement

The terminal view currently has four basic theme presets (default, cyberpunk, matrix, dracula) that only set three properties (background, foreground, cursor). There is no support for custom fonts, CRT visual effects, full ANSI colour palettes, or per-terminal chrome styling. Users want authentic retro terminal experiences — Commodore 64, MS-DOS, Apple IIe, and amber CRT — with scanlines, phosphor glow, monitor borders, and pixel fonts.

## Design Decisions

| Decision             | Choice                                                            | Rationale                                                    |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| CRT scanlines        | Global toggle per terminal, independent of theme                  | Allows scanlines on any theme including cyberpunk/matrix     |
| Font source          | Bundled WOFF from oldschool_pc_font_pack_v2.2_FULL (CC BY-SA 4.0) | Local fonts, no CDN dependency, licence permits bundling     |
| UI library resources | NES.css, 98.css/React95, Arwes noted for chrome styling           | Hand-roll initially, full libraries available for future     |
| Theme scope          | Terminal instance + its chrome (toolbar, tabs, macro bar)         | Immersive where it matters without touching chat/ports views |
| Tuning controls      | Popover next to theme dropdown, per-terminal                      | Discoverable, compact, scoped to the terminal instance       |
| Boot sequences       | On terminal creation only                                         | Non-destructive — switching themes preserves scrollback      |
| Styling approach     | Hand-written CSS with CSS custom properties                       | Consistent with existing codebase, no Tailwind dependency    |

## Architecture

### Module Structure

Four files — three new, one modified:

| File                   | Path                                     | Role                                            |
| ---------------------- | ---------------------------------------- | ----------------------------------------------- |
| `terminal-themes.js`   | `electron/renderer/terminal-themes.js`   | Pure data — theme definitions                   |
| `terminal-effects.js`  | `electron/renderer/terminal-effects.js`  | DOM operations — overlays, glow, borders        |
| `terminal-theme-ui.js` | `electron/renderer/terminal-theme-ui.js` | UI component — tuning popover                   |
| `terminals.js`         | `electron/renderer/terminals.js`         | Orchestrator — imports modules, wires lifecycle |

Additional changes:

- `electron/assets/fonts/` — new directory for bundled WOFF fonts
- `terminal-config.js` — `THEME_PRESETS` object removed (themes now live in `terminal-themes.js`); file retained for `DEFAULT_MACROS` and `DEFAULT_COMMANDS`
- `index.html` — minimal changes (font-face if not injected by JS)

### Theme Definition Shape

Each theme is a self-contained object:

```javascript
{
  id: 'c64',
  name: 'Commodore 64',
  era: '1982',
  xterm: {
    background: '#352879',
    foreground: '#6C5EB5',
    cursor: '#6C5EB5',
    cursorAccent: '#352879',
    selectionBackground: 'rgba(108, 94, 181, 0.3)',
    black: '#000000',
    red: '#880000',
    green: '#00cc55',
    yellow: '#cccc00',
    blue: '#352879',
    magenta: '#cc44cc',
    cyan: '#00cccc',
    white: '#6C5EB5',
    brightBlack: '#444444',
    brightRed: '#ff5555',
    brightGreen: '#55ff55',
    brightYellow: '#ffff55',
    brightBlue: '#6C5EB5',
    brightMagenta: '#ff55ff',
    brightCyan: '#55ffff',
    brightWhite: '#ffffff',
  },
  font: {
    family: 'C64_Pro_Mono',   // @font-face name
    file: 'C64_Pro_Mono.woff', // file in electron/assets/fonts/
    size: 16,
  },
  cursor: {
    style: 'block',  // 'block' | 'bar' | 'underline'
    blink: true,
  },
  effects: {
    glow: {
      enabled: false,
      color: 'rgba(108, 94, 181, 0.8)',
      radius: 5,
    },
    border: {
      enabled: true,
      color: '#6C5EB5',
      width: 24,
    },
  },
  chrome: {
    toolbarBg: '#2a2060',
    buttonStyle: 'pixel',    // 'default' | 'pixel' | 'bevel' | 'vector'
    accentColor: '#6C5EB5',
    tabIndicatorColor: '#6C5EB5',
  },
  boot: {
    lines: [
      '**** COMMODORE 64 BASIC V2 ****',
      '',
      '64K RAM SYSTEM  38911 BASIC BYTES FREE',
      '',
      'READY.',
    ],
    delay: 50,  // ms between lines
  },
  tuning: {
    lineHeight: 1.4,
    letterSpacing: 1,
  },
}
```

### Theme Catalogue

Eight themes total — four existing (migrated to new shape) plus four new retro themes:

#### Existing Themes (Migrated)

| ID          | Name      | Font              | Effects                               |
| ----------- | --------- | ----------------- | ------------------------------------- |
| `default`   | Default   | System (Consolas) | None                                  |
| `cyberpunk` | Cyberpunk | System (Consolas) | None (scanlines available via toggle) |
| `matrix`    | Matrix    | System (Consolas) | None (glow available via toggle)      |
| `dracula`   | Dracula   | System (Consolas) | None                                  |

#### New Retro Themes

**Commodore 64** (`c64`)

- Colours: Background `#352879`, Foreground/Border `#6C5EB5`
- Font: C64 Pro Mono (sourced separately, not in oldschool pack)
- Effects: Monitor border (24px, `#6C5EB5`), block cursor
- Chrome: Pixel-style buttons, deep purple toolbar
- Boot: `**** COMMODORE 64 BASIC V2 ****` / `64K RAM SYSTEM...` / `READY.`

**MS-DOS 3.30** (`msdos`)

- Colours: Background `#000000`, Foreground `#AAAAAA`, Bright `#FFFFFF`
- Font: `Web437_IBM_VGA_9x16.woff` from oldschool pack
- Effects: No glow, no border, high contrast
- Chrome: Minimal dark toolbar
- Boot: `Microsoft(R) MS-DOS(R) Version 3.30` / `(C)Copyright Microsoft Corp 1981-1987`

**Apple IIe** (`apple2`)

- Colours: Background `#000000`, Foreground `#33FF33` (or `#00C929`)
- Font: PrintChar21 or Apple II pixel font (sourced separately)
- Effects: Green phosphor glow (`text-shadow: 0 0 5px rgba(51, 255, 51, 0.8)`), block cursor
- Chrome: Dark with green accent
- Boot: `APPLE ][` / `]`

**CRT Amber** (`amber`)

- Colours: Background `#0a0800`, Foreground `#FFB000`
- Font: `Web437_IBM_VGA_9x16.woff` from oldschool pack
- Effects: Amber phosphor glow (`text-shadow: 0 0 5px rgba(255, 176, 0, 0.7)`)
- Chrome: Dark with amber accent
- Boot: `SYSTEM READY`

### Effects System

`terminal-effects.js` exports four functions:

#### `createScanlineOverlay(terminalSurface) → { element, remove() }`

Injects a `position: absolute; pointer-events: none` div over the terminal surface with CSS gradient scanline pattern:

```css
background:
  linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
  linear-gradient(
    90deg,
    rgba(255, 0, 0, 0.06),
    rgba(0, 255, 0, 0.02),
    rgba(0, 0, 255, 0.06)
  );
background-size:
  100% 2px,
  3px 100%;
```

Opacity is parameterised via CSS custom property `--scanline-opacity` for live tuning.

#### `applyCRTGlow(terminalSurface, color, radius) → remove()`

Sets `text-shadow` on the `.xterm` element within the surface. Multiple radii for authentic cathode-ray bleed:

```css
text-shadow: 0 0 {radius}px {color}, 0 0 {radius*2}px {color_at_half_opacity};
```

#### `wrapMonitorBorder(terminalSurface, color, width) → unwrap()`

Wraps the terminal surface in a padding div simulating CRT bezel. The wrapper div gets the border colour as background, the terminal surface sits inside with the specified padding.

#### `removeAllEffects(terminalSurface)`

Tears down overlay, glow, and border cleanly. Called before applying a new theme.

### Tuning Popover

Gear icon (⚙) appears next to the theme dropdown in each terminal's macro bar. Clicking opens a popover with:

| Control          | Type   | Range   | Default       |
| ---------------- | ------ | ------- | ------------- |
| Font Size        | Slider | 10–24px | Theme default |
| Line Height      | Slider | 1.0–2.0 | Theme default |
| Letter Spacing   | Slider | 0–4px   | Theme default |
| Glow Intensity   | Slider | 0–100%  | Theme default |
| Scanline Opacity | Slider | 0–100%  | 30%           |
| CRT Scanlines    | Toggle | on/off  | Per theme     |
| Monitor Border   | Toggle | on/off  | Per theme     |

All changes apply live. Settings are stored per terminal instance in the `terminalInstances` Map.

### Boot Sequence Behaviour

On terminal creation in `terminals.js`:

1. Terminal is created and xterm.js instance is initialised
2. If the selected theme has `boot.lines`, each line is written via `terminal.write(line + '\r\n')` with `boot.delay` ms between lines
3. After boot text completes, PTY output streaming begins
4. Boot text is renderer-side only — no IPC required
5. Theme switching on an existing terminal does NOT trigger boot text

### Font Loading Strategy

1. Selected WOFF files are copied from `C:\fonts\oldschool_pc_font_pack_v2.2_FULL\woff - Web (webfonts)/` to `electron/assets/fonts/`
2. Fonts are registered via the `FontFace` API in `terminal-themes.js` on first load:
   ```javascript
   const font = new FontFace(
     "Web437_IBM_VGA_9x16",
     "url(../assets/fonts/Web437_IBM_VGA_9x16.woff)",
   );
   await font.load();
   document.fonts.add(font);
   ```
3. C64 and Apple II fonts are sourced separately (both freely available) and placed in the same directory
4. Font loading is awaited before applying a theme that uses a custom font

### Chrome Theming

Each theme can define `chrome` overrides applied to the terminal instance's surrounding UI:

- `toolbarBg` — toolbar/macro bar background colour
- `buttonStyle` — styling approach for buttons within the terminal chrome:
  - `'default'` — current app styling
  - `'pixel'` — NES.css-inspired: 2px solid borders, no border-radius, pixelated aesthetic
  - `'bevel'` — 98.css-inspired: raised/sunken 3D bevel effect
  - `'vector'` — Arwes-inspired: thin glow borders, subtle animations
- `accentColor` — border/highlight colour for the terminal wrapper
- `tabIndicatorColor` — active tab indicator colour

Chrome styles are applied as CSS classes or inline styles scoped to the terminal instance wrapper div (`.terminal-instance-wrapper`). No global CSS pollution.

### Per-Terminal State

Each entry in the `terminalInstances` Map is extended with:

```javascript
{
  terminal: Terminal,        // xterm.js instance (existing)
  theme: 'c64',             // current theme ID (existing, now richer)
  effects: {
    scanlineOverlay: null,   // reference to scanline DOM element
    glowRemove: null,        // cleanup function for glow
    borderUnwrap: null,      // cleanup function for monitor border
  },
  tuning: {
    fontSize: 16,
    lineHeight: 1.4,
    letterSpacing: 1,
    glowIntensity: 50,
    scanlineOpacity: 30,
    scanlines: true,
    border: true,
  },
}
```

## Resources Noted for Future

These libraries are noted for potential integration in later iterations:

- **NES.css** — pixelated UI components for C64/8-bit chrome styling
- **98.css / React95** — Windows 95/early DOS era 3D bevel chrome
- **Arwes** — futuristic/cyberpunk vector line and sound effects for sci-fi theme variants

## Out of Scope

- Agent presence sprites in terminal corners (separate feature)
- Theming the chat panel, ports dashboard, or main app shell
- Sound effects (boot beeps, keypress sounds)
- Theme persistence across app restarts (future: electron-store)
- Custom user-defined themes (future: theme editor)

## Acceptance Criteria

- [ ] Four new retro themes (C64, MS-DOS, Apple IIe, CRT Amber) are selectable per terminal
- [ ] Existing four themes (default, cyberpunk, matrix, dracula) continue to work unchanged
- [ ] CRT scanline overlay toggleable independently of theme
- [ ] Phosphor glow effect works on Apple IIe and Amber themes
- [ ] Monitor border renders correctly on C64 theme
- [ ] Pixel fonts load and render in terminal instances
- [ ] Boot sequences display on terminal creation (not on theme switch)
- [ ] Tuning popover allows live adjustment of font size, line height, letter spacing, glow, scanlines
- [ ] Each terminal instance maintains independent theme and tuning state
- [ ] Chrome (toolbar, buttons, tab indicator) themes per terminal instance
- [ ] Theme switching does not affect other terminal instances
- [ ] Effects are cleanly removed when switching away from a retro theme
- [ ] No regressions in existing terminal functionality (resize, input, PTY streaming)
- [ ] Font files are bundled in electron/assets/fonts/ with proper licence attribution
