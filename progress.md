Original prompt: Implement the proposed plan for rebuilding La Broma Macabra as a guided 09:00-13:00 vertical slice.

## Product decisions

- Guided menus with no parser or hotspot hunting.
- Edith Harker remains the leader; Nadia and Vance can receive concurrent assignments.
- Preserve the module schedule and prose; add player-caused branches around it.
- The first playable slice runs from 09:00 to 13:00 and culminates in the Solar Disk scene.
- Leads show states and deadlines. Companion discoveries remain private until reunion.
- Rolls are visible and failed rolls may be converted by spending Luck.
- Three manual save slots. No rewind and no autosave.

## Implementation checklist

- [x] Add the guided investigation layer, leads, assignments, reports and pending rolls.
- [x] Turn the 12:30 Solar Disk event into an interactive branching scene.
- [x] Add versioned full-game snapshots and three local save slots.
- [x] Rebuild the UI around Scene, Actions, Case, Map, Team, History and Save.
- [x] Add render_game_to_text, advanceTime and fullscreen keyboard support.
- [x] Add branch and regression tests; fix the pre-existing overshoot test.
- [x] Run the game test client and visually inspect important paths.

## Notes

- Baseline before implementation: 170 tests passed and 1 scheduler/time test failed because waiting from 16:45 by 45 minutes landed at 17:30 rather than the asserted 17:15 state.
- Waiting now advances in 15-minute decisions, while explicit actions retain their authored costs.
- Underground map destinations remain hidden until the service route is actually learned.
- Browser checks covered initial UI, case, team assignments, the Solar Disk scene, Luck spending UI and save/load restoration.
- Automated suite after implementation: 180 tests passing.

## Product handoff

- [x] Added `docs/DIRECCION-DE-DISENO.md` as the source of truth for future sessions.
- [x] Added a reusable prompt for polishing the 09:00–13:00 demo.
- [x] Added a reusable prompt and production checklist for a fully original EGA art pack.
- [x] Updated README and replaced the obsolete Sonnet handoff.
- [x] Published the clean source tree to `Arkus0/ctulhu-game` on branch `main`.
- [x] Verified a fresh clone with `npm ci`, 180 tests, a production build and a browser smoke test.
- [x] Upgraded Vitest to 3.2.7; `npm audit` now reports zero known vulnerabilities.
- [x] Added `CLAUDE.md` and a local-reference manifest so future sessions verify the ignored PDF and temporary art before relying on them.

## Next recommended milestone

Polish the existing demo before extending the schedule: reactive investigator dialogue, restrained original audio, interactive versions of the arrival/Behler/basement scenes, meaningful quality levels for companion reports, and three complete browser playthroughs.

The public repository must exclude the source PDF and current cropped module illustrations. Missing art intentionally falls back to the procedural EGA renderer until original replacements are approved.
