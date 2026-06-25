# Changelog

All notable design and gameplay changes, newest first. (Versions track the design iterations recorded in the GDD.)

## v1.2 — Game replays
- When a game ends you can **⬇ Download this game** as a `circuit-replay-*.json` (turn-by-turn snapshots), and later **Load** it to watch it back with Prev / Play / Next controls (board read-only). Works for local and online games (online host records and shares it with the guest). Built into `index.html`.
- Verified: replays record/step/export correctly (132 assertions; ~41 frames per 20-turn game).

## v1.1 — Online multiplayer
- **Online multiplayer (in `index.html`):** two humans play over the internet via a **4-character room code** (Create / Join). Host-authoritative relay over **Socket.IO** on the Node server; deployable free on **Render.com** (includes `render.yaml`).
- The local game (`index.html`) and all AI modes are unchanged.
- Verified: relay protocol (create / join / full-room / state+action relay / disconnect cleanup) passes 12/12 checks; the game still passes the full local-play harness (4,000 games).

## v1.0 — AI opponent (Player 2)
- Player 2 can be **Human**, **Random bot** (uniform legal move), **Heuristic AI** (rule-based strategy), or **OpenAI AI** (model `gpt-5.4-nano` via function-calling — each legal move is a tool).
- AI turns are **animated**. Player 1 stays human.
- OpenAI bot runs through a small local Node server (`server.js`) that reads the key from a git-ignored **`.env`** — the key never touches the browser or the repo. Falls back to the heuristic if the server is unavailable.
- Verified: 5,000 AI-driven games, ~7.3M invariant/legality assertions, no failures; heuristic beats random ~99%.

## v0.9.7 — Out-of-reach pricing cue
- Flop states **within movement range but unaffordable** are now highlighted **yellow** (with their price) instead of being unmarked — so you can see targets you could reach if you had the money. No claim option appears; you can still walk over/toward them.

## v0.9.6 — JSON save files + visual polish
- **Storage switched from localStorage to JSON files** (per teacher feedback): 💾 **Save** downloads `circuit-save.json` (in-progress game + history); 📂 **Load** reads it back (also offered on the start screen). History is in-memory per session and included in the save file.
- Price-tier colours are now a **monochrome lavender ramp** ($2 lightest → $8 darkest).
- **Larger price numbers** on the board for legibility.
- Flop claim label now reads **"Claim for $X"**.

## v0.9.5 — Save & history
- **Autosave / resume:** the game in progress is snapshotted to the browser at the start of each turn; reload the page and a "Resume game" option appears on the start screen.
- **Game history:** finished games are recorded (winner, tiebreaker, each player's cluster / states / coins spent) and viewable via a 📜 **History** button; kept on this device, last 50 games, with a Clear option.
- Storage is browser-local (per device and per URL) and fails gracefully if unavailable (private mode, etc.).

## v0.9.4 — Claim is now a choice
- Clicking an affordable Flop tile opens a popup: **Claim** (ends turn), **Pass through** (move on without buying), or **Cancel**. Stepping onto a tile never auto-claims, so misclicks can't cost you a purchase, and you're never forced to claim a tile you only pass over.

## v0.9.3 — Pass-through fix
- An unclaimed Flop tile you **can't afford** is now walkable (pass through or stop on it); only affordable Flop tiles act as claim targets. Previously an unaffordable Flop tile blocked movement entirely.

## v0.9.2 — Coin cap & contract purchase flow
- **Coins capped at 20** to stop hoarding (Holding never exceeds the cap).
- Contract tiles are now **walkable**; you claim one only by standing on it and pressing **Reveal → Show → Buy** — passing over it is silent, and only the purchase reveals it.
- Buying draws a replacement immediately (reserved out of the pool); a player with no contract is regranted one at turn start if a state frees up.

## v0.9.1 — Game length
- Game length increased from 10 to **20 turns** (more room for the steal/contract layers and a late-game expansion-to-conflict arc). Re-verified with 3,000 simulated 20-turn games.

## v0.9 — Secret Contracts
- Each player holds one **private target state**, visible only to them via a two-step reveal that auto-hides on turn change.
- Pulled out of the shared pool: never appears in the Flop, can't be claimed/stolen by the opponent, can't be the opponent's contract.
- Same price/value as a Flop tile; claim it by moving onto it (not marked on the board — remember by name), then draw a new one. Cannot be discarded.
- Verified with 3,000 simulated games (~1,008,000 invariant checks passed).

## v0.8.1 — Smaller Flop
- Flop reduced from 6 to 3 states for sharper contention and faster turnover.

## v0.8 — Slower movement (d3)
- Movement die changed from d6 to **d3** so a single roll can't cross the board; positioning matters.
- Hold and movement fully separated: Roll to advance, or Hold for +5 coins.
- Lucky-6 discount retired.

## v0.7 — Stealing
- Seize an opponent's tile by paying **2x** its price; ends your turn.
- Anti-ping-pong lock: a tile that just changed hands can't be stolen back the very next turn.

## v0.6.x — Affordability, colour, scoring
- Blocking: you can never make a move you can't fully pay for (no negative currency).
- Cost-aware green highlights only show targets you can actually afford to reach.
- Price tiers recoloured to a violet→magenta gradient (no clash with gameplay colours).
- Scoring is your **largest connected cluster** (need not include the start). Tiebreakers: total states owned, then total coins spent, else a draw.

## v0.5.x — Movement-cost drain & UI
- Replaced start-of-turn drain with a move