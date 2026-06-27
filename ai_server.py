# CIRCUIT — AI Strategist server (Python / Flask)
#
# A tiny local backend that:
#   1. serves the existing game (index.html + assets), and
#   2. exposes ONE new endpoint, POST /api/ai-hint, which sends a short
#      text description of the current board + budget to OpenAI gpt-5.4-nano
#      and returns a 1-2 sentence strategic hint OR an in-character taunt.
#
# The OpenAI key stays SERVER-SIDE (read from .env) — it is never sent to the
# browser. This sits alongside Vihaan's original Node server.js; it does not
# replace it. Run either one; this one is all you need for the AI Strategist.
#
#   python -m venv venv && source venv/bin/activate     (Windows: venv\Scripts\activate)
#   pip install -r requirements.txt
#   # put your key in .env  (OPENAI_API_KEY=sk-...   OPENAI_MODEL=gpt-5.4-nano)
#   python ai_server.py
#   # open http://localhost:5001  and click "🧠 AI Strategist" in the game

import os
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("AI_PORT", "5001"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-nano")
API_KEY = os.environ.get("OPENAI_API_KEY")

client = OpenAI(api_key=API_KEY, timeout=30) if API_KEY else None

app = Flask(__name__, static_folder=None)

SYSTEM = (
    "You are the CIRCUIT AI Strategist — a sharp, slightly cocky board-game coach. "
    "CIRCUIT is a 2-player territory game on 25 states. The goal is to build the "
    "LARGEST single CONNECTED cluster of states you own (only your biggest cluster "
    "scores; ties break by total states, then coins spent). Central, pricier states "
    "(GRAIL is the $8 hub) connect more and are strongest. Income is scarce: you only "
    "gain coins by HOLDING (+5, capped at 20), so never overspend. Each turn you ROLL "
    "a d3 to move and claim a Flop tile, HOLD for coins, or SEIZE an opponent tile for "
    "double price to split their cluster. You also hold one secret contract tile. "
    "Given a snapshot of the board, reply with ONE punchy hint (1-2 sentences, under 40 "
    "words) telling the active player their single best idea right now. If asked for a "
    "taunt, give a short playful in-character jab instead. Be concrete: name states, "
    "coins, or 'hold' when it fits. No preamble, no lists — just the line."
)


def build_user_prompt(board, mode):
    """Turn the board snapshot from the browser into a compact text description."""
    lines = []
    lines.append(f"Turn {board.get('turn', '?')} of {board.get('maxTurns', '?')}.")
    lines.append(f"Active player: {board.get('activePlayerName', 'You')} (P{board.get('activePlayer', '?')}).")
    lines.append(f"Your coins: {board.get('yourCoins', '?')}. Opponent coins: {board.get('oppCoins', '?')}.")
    lines.append(
        f"Your largest connected cluster: {board.get('yourCluster', 0)} states "
        f"(you own {board.get('yourTotal', 0)} total)."
    )
    lines.append(
        f"Opponent's largest connected cluster: {board.get('oppCluster', 0)} states "
        f"(they own {board.get('oppTotal', 0)} total)."
    )
    lines.append(f"You are standing on: {board.get('yourTile', '?')}.")
    flop = board.get("flop") or []
    if flop:
        flop_txt = ", ".join(f"{f.get('state')} (${f.get('cost')})" for f in flop)
        lines.append(f"Claimable Flop tiles right now: {flop_txt}.")
    contract = board.get("contract")
    if contract:
        lines.append(f"Your secret contract target: {contract.get('state')} (${contract.get('cost')}).")
    your_tiles = board.get("yourTiles") or []
    if your_tiles:
        lines.append("States you own: " + ", ".join(your_tiles) + ".")

    if mode == "taunt":
        lines.append("\nGive a short, playful in-character taunt about this position.")
    else:
        lines.append("\nGive me my single best strategic move right now.")
    return "\n".join(lines)


@app.route("/api/ai-hint", methods=["POST"])
def ai_hint():
    if client is None:
        return jsonify({"error": "OpenAI not configured (set OPENAI_API_KEY in .env)."}), 503
    data = request.get_json(silent=True) or {}
    board = data.get("board") or {}
    mode = data.get("mode", "hint")  # "hint" or "taunt"
    try:
        user_prompt = build_user_prompt(board, mode)
        r = client.responses.create(
            model=MODEL,
            input=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            reasoning={"effort": "low"},   # CRITICAL: without this output_text can be empty
            text={"verbosity": "low"},
            max_output_tokens=600,
        )
        text = (r.output_text or "").strip()
        if not text:
            text = "Hold for coins and build out from your strongest cluster."
        return jsonify({"hint": text, "mode": mode})
    except Exception as e:  # noqa: BLE001 — surface the message to the UI/log
        print("ai-hint error:", repr(e))
        return jsonify({"error": str(e)}), 500


# ---- serve the original game (single HTML file + assets) ----
@app.route("/")
def index():
    return send_from_directory(HERE, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(HERE, path)


if __name__ == "__main__":
    print(f"CIRCUIT AI Strategist on http://localhost:{PORT}   "
          f"(model={MODEL}, OpenAI {'ready' if client else 'OFF — no key'})")
    app.run(host="0.0.0.0", port=PORT, debug=False)
