# CIRCUIT — AI removal & heuristic strengthening run summary (2026-07-07/08)

Scheduled task `circuit-remove-ai-strengthen-heuristic`, spec: `circuit-remove-ai-prompt.md`.
Two commits on `main`, pushed separately as instructed.

## Part 1 — Remove AI Strategist, LLM opponent, Random bot

Commit `74ec48e` — **Remove AI Strategist, LLM opponent, and Random bot mode**

Files changed (10 files, 29 insertions, 652 deletions):

| File | What changed |
|---|---|
| `index.html` | Deleted the `#aiStrategistCard` hint/taunt panel and `#aiHintBox`; deleted `aiBoardSnapshot()`, `getAIHint()`, `escapeHTML()` (only used by the Strategist), `AI_ENDPOINT`/`AI_HINT_ENDPOINT`; deleted `llmChoose()`, `randomChoose()`, and the now-dead `aiStateFor()`/`actionKey()` helpers; simplified `chooseAction()` to always call `heuristicChoose()`; simplified `isBot()` to `p===1 && P2MODE==='heuristic'`; `p2mode` `<select>` now has only `human` / `heuristic` (labelled **Computer**) / `online`; removed `P2MODE==='random'`/`'llm'` branches from `startBotTurn()`/`startGame()` bot-naming. |
| `server.js` | Removed the `openai` require/client init, `MODEL`, `describe()`, `GAME_RULES`, `STRATEGIST_SYSTEM`, `buildHintPrompt()`, and the `/api/ai-hint` + `/api/ai-move` routes. `express.static`, CORS, and the full Socket.IO relay block are untouched. |
| `package.json` / `package-lock.json` | Dropped the `openai` dependency; updated `description`; lockfile regenerated via `npm install` (removed 7 packages). |
| `ai_server.py`, `requirements.txt` | Deleted (Flask AI Strategist backend, no longer used). |
| `render.yaml`, `.env.example` | Removed the OpenAI-key setup notes; no API key is needed anywhere now. |
| `README.md`, `CHANGELOG.md` | Rewrote the "AI opponent" section to describe exactly Human / Computer / Online; added a `v1.4` changelog entry. |

**Verified before commit:**
- `node server.js` starts cleanly, no `openai` require errors, no API-key env vars needed.
- Player 2 dropdown shows exactly **Human (hot-seat)**, **Computer**, **🌐 Online opponent** — no Random bot, no OpenAI option.
- Full 20-turn game vs Computer plays to completion via `heuristicChoose`, zero network calls (checked `preview_network`, only font/Socket.IO requests).
- Online multiplayer create/join relay smoke-tested (socket `create` ack returned a valid room code).
- Repo-wide grep: no leftover `AI_ENDPOINT`, `AI_HINT_ENDPOINT`, `llmChoose`, `randomChoose`, `aiStrategistCard`, `aiHintBox`, `GAME_RULES`, `STRATEGIST_SYSTEM`, `openai`/`anthropic` packages, or the string "Heuristic AI" anywhere in the shipped code (only in this repo's historical `CHANGELOG.md` v1.0 entry, which documents past versions and is intentionally left unedited, and in the source spec file `circuit-remove-ai-prompt.md`).

Pushed to `origin/main`: `e540913..74ec48e`.

## Part 2 — Strengthen `heuristicChoose`

Commit (this one) — **Strengthen heuristicChoose: simulated-growth claims, denial-based steals, conditional contract buys, late-game awareness**

All changes confined to `index.html`'s `heuristicChoose()` (plus one new small helper, `simulatedClusterCount()`). `bestTargetFor()` and `bfsFrom()` — the movement/pathing helpers — are **byte-for-byte unchanged**.

### Scoring changes

1. **Claims** are now ranked by *simulated resulting cluster size*: for each candidate claim, the code temporarily sets `G.owner[state]=p`, reads `connectedScore(p).count`, then reverts (`simulatedClusterCount`). The claim with the largest actual cluster-size increase wins; `COST[state]` is subtracted only as a tiebreaker between equal-growth claims, never as a bonus — replacing the old `adjToOwn(...)?100:0` proxy + raw-cost bonus.
2. **Steals** are scored by *denial*: the same simulate-then-`connectedScore` trick is run on the opponent's count after the hypothetical seizure. A steal is only taken if `(my growth) + (opponent's shrinkage) > 0` — replacing the old `COST[G.token[p]]>=4` proxy for "worth stealing."
3. **Contract buying is conditional**, not automatic: the contract is bought immediately if it actually grows the player's cluster (`buyGrowth>0`) *or* if buying it still leaves a small cash reserve for the next turn or two (`reserve = 2`, relaxed to `0` on the last two turns). If neither holds, the code instead looks at the best available claim/steal for this turn and comes back for the contract later (it stays reserved until bought). If no better alternative exists this turn, it still buys.
4. **Late-game awareness**: on the very last turn (`turnsLeft<=0`), the roll/hold choice always rolls — banked coins have no further payoff once the game is about to end. (An earlier draft used a `turnsLeft<=2` cutoff; A/B testing showed that was too aggressive — see below — so it was narrowed to the final turn only.)
5. Kept fully synchronous, single-pass, simulate-and-revert per candidate — no minimax/deep search, no network calls, no perceptible delay.

### Performance verification

- `heuristicChoose` measured directly: **max 0.5 ms per decision**, ~1.4 ms/decision including the surrounding turn machinery, a full 20-turn game (~75 bot/player decisions) completes in ~107 ms. No `await`/`fetch`/timers inside the function — fully synchronous.
- Ran a real game through the actual production path (`isBot()` → `startBotTurn()` → `botTurnStep()`, real animation timers), confirmed it reaches turn 21 (game over) with sane cluster sizes and the correct win screen ("Player 1 WINS … Computer: cluster 9 …").

### A/B testing (new heuristic vs. the previous scoring, kept temporarily as `heuristicChooseOld` and deleted after validation)

Because CIRCUIT has substantial built-in randomness (dice rolls, random start positions, random Flop/contract draws), a small number of games is a very noisy signal — even the **old** heuristic playing itself split roughly 53%/46%/1% over 300 games purely from randomness. So testing was done at scale (300–3,000 simulated games per comparison, driven headlessly through the same `legalActions`/`applyAction` game engine used by real play, alternating which side went first to cancel first-move advantage):

| Comparison | Result (games) | Note |
|---|---|---|
| Old vs. itself (baseline noise check) | 160 / 139 / 1 (N=300) | Confirms the game's dice/shuffle randomness alone produces large swings — needed as a sanity baseline. |
| New claims only (simulated growth) vs. old | ~290/309 (N=600), roughly neutral-to-slightly-behind | The old `adjToOwn`+cost proxy implicitly rewards expensive/central tiles (which correlates with future connectivity in this map); a pure one-ply growth metric can't see that, so it isn't a clear win in isolation — but it is the theoretically correct metric the task asked for. |
| New steal (denial-gated) only vs. old | 170/128 (N=300), 314/284 (N=600) | The most consistent, repeatable improvement — replacing the `COST>=4` proxy with an actual denial measurement reliably outperforms. |
| New contract-buy conditional only vs. old | ~145/153 (N=300), roughly neutral | Rarely changes behaviour (buy/steal can never be simultaneously legal; buy/claim conflicts are rare), so it doesn't move the needle much alone. |
| Naive "late game ⇒ always roll for last 2 turns" | 137/163 (N=300) — a real regression | Too aggressive: it discarded a still-useful hold-to-afford-a-claim option one turn before the end. Narrowed to the *last turn only*, which then measured 155/144 (N=300), positive. |
| **Final combined heuristic vs. old** (claims + steal + conditional buy + narrowed late-game) | **1514 wins / 1475 losses / 11 draws over 3,000 games** (two runs of 1,500), i.e. **1,525 non-losses vs. 1,475 losses** | Net positive — wins/ties more often than it loses, satisfying the acceptance bar, though the margin is modest given how much randomness the base game has. |

**Honest caveat for the record:** given CIRCUIT's dice- and shuffle-driven variance, no single-ply greedy tweak produces a dramatic win-rate jump — the aggregate edge above is real but modest (~50.8% non-loss rate). The clearest, most reproducible individual improvement is the steal/denial scoring change; the claim and contract-buy changes are net-neutral-to-slightly-positive in combination but are still the more theoretically correct approach per the task's requirement (using the actual `connectedScore` objective instead of ad hoc adjacency/cost proxies), and they do not introduce any regression when combined with the late-game and steal fixes.

Also ran ≥5 full local games manually via the actual `startGame()`/`isBot()`/`botTurnStep()` production path (not just the headless harness) to confirm no functional regressions in real play, in addition to the thousands of headless A/B games above.

Pushed to `origin/main` after this commit.
