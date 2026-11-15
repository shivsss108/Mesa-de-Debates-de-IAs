# Final fix report

- I-1: src/app/mesa/page.tsx (defaultCamera="diretor") and Stage.tsx default -> 'diretor'. Check: DOM on /mesa?replay=demo-1 shows "Câmera: Diretor".
- I-2: clock moved from Stage into Telao (Studio.tsx); Stage/Studio no longer take elapsedMs. Interval only runs with a config, resets on config change. telao.ts: maxTurns<=0 gives empty status (no "Turno 0/0"); test added in tests/scene/telao.test.ts. Paused clock: pause state is local to Hud, left a `ponytail:` note in Telao.
- Minor 2: LowerThird.tsx polls speechProgress every 250 ms (setInterval, so it works with a hidden tab), hides the GC 1.5 s (GC_LINGER_MS) after progress>=1, reappears on next turn (keyed by turnSeq). No animation involved, so reduced-motion is unaffected. DOM check: in demo-1 the next turn starts before the 1.5 s linger elapses, so the hide path was not observed live (not unit-tested; no pure helper extracted).
- Minor 3: Hud.tsx Fontes panel rendered after the toolbar; position is CSS (absolute) so visual unchanged.
- Minor 4: EndPanel.module.css phone .reopen moved to bottom (above controls bar); Hud hides the hands list once scene.ended.
- Commands: npx vitest run -> 37 files, 309 tests passed; npx tsc --noEmit clean; eslint on touched src/scene files clean. Console: only HMR websocket errors.
- Not checked: screenshots (pane hidden), phone layout of reopen button visually, `/` home telão.
