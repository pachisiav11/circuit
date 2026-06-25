# CIRCUIT — Design Summary

A concise, readable summary of the rules and the reasoning behind them. The full Game Design Document (with complete change history) is in `CIRCUIT_GDD.docx`.

## Overview

CIRCUIT is a 2-player hot-seat strategy game on a fixed map of **25 states** drawn as irregular Voronoi polygons. Two states are adjacent if they share a border; adjacency is derived directly from those borders. Players start on opposite edge states and, over a configurable number of turns (**default 20**, set on the start screen — in online games the host's value is used), build the largest **connected cluster** of states.

## The economy

- Each player starts with **15 coins** and earns nothing except by Holding (+5).
- Coins are **capped at 20** to prevent hoarding, and spent on claims, stealing, and opponent-tile movement tolls.
- You can never overspend: any move you can't fully pay for is blocked. Currency stays within 0–20.

## A turn

1. **Roll a d3** (move 1–3) **or Hold** (+5 coins, end turn).
2. If you rolled, **move your token** one adjacent tile at a time along a route you choose:
   - Own/empty tiles are free to cross.
   - **Opponent tiles cost 1 coin** each to step on.
3. You may **claim** the unclaimed tile you land on if it's a **Flop** tile or your **secret contract** and you can afford it. Claiming ends your turn.
4. Or **seize** an opponent tile you're standing on by paying **2× its price** (ends your turn).

## Key systems

- **The Flop.** Exactly **3** claimable states are public at any time; claiming or swapping refills from the pool. Small Flop = high contention and fast turnover.
- **Movement (d3).** The board is ~6 tiles wide, so a d3 makes crossing it a multi-turn commitment — positioning matters, and a single roll can't teleport you anywhere.
- **Stealing.** Pay 2× to take an opponent tile; ideal for splitting their cluster by capturing a bridge. A just-taken tile is locked from being stolen back for one turn (no ping-pong).
- **Secret Contracts.** Each player holds one private target state, hidden from the opponent. Contract tiles are walkable and unmarked; to claim one you stand on it and deliberately Buy it — only the purchase reveals it, and passing over it is silent. (Online and vs-AI the contract is shown to its owner at all times, since the opponent can never see it; hot-seat keeps the Reveal → Show → Buy step so a shared screen stays secret.) It's removed from the shared pool (never in the Flop, never claimable/stealable by the opponent). Same price as a Flop tile; buying draws a replacement immediately. Pure-random selection; cannot be discarded.

## Save

Saving uses a **JSON file** (no browser storage): **Save** downloads `circuit-save.json` containing the in-progress game and the results history; **Load** restores it (and resumes the game if one was in progress). Results (last 50) still ride inside the save file — there is no separate in-app History panel; the JSON is the record of truth.

## Winning

After the final turn, the player with the most states in a single **connected cluster** wins. Tiebreakers, in order: most total states owned → most coins spent buying states → otherwise a draw.

## Design intent (short version)

- **No income but Hold** keeps every coin precious and makes expansion a real sacrifice.
- **Movement tolls** punish cutting through enemy territory and replace the old start-of-turn drain.
- **Small Flop + slow movement** turn the midgame into a contest over a few shared tiles.
- **Stealing + Secret Contracts** add direct conflict and hidden information to what was otherwise a perfect-information race.

## Verification

Core rules were stress-tested with 3,000 simulated full games (~2 million invariant checks): no negative currency, Flop always 