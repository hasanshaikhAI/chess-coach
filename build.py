"""Build chess-coach.html, one self-contained file, from app.src.html.

    python build.py <vendor-dir>

<vendor-dir> holds: chess.js (v0.10.3), stockfish.js (v10 asm.js build),
a.tsv..e.tsv (lichess-org/chess-openings, CC0) and the twelve cburnett piece
SVGs (wK.svg ... bP.svg, from lichess-org/lila, GPL).
"""
import base64
import json
import re
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
vendor = Path(sys.argv[1])

src = (here / "app.src.html").read_text(encoding="utf-8")

chessjs = (vendor / "chess.js").read_text(encoding="utf-8").replace("</script>", "<\\/script>")

openings = {}
for letter in "abcde":
    for line in (vendor / f"{letter}.tsv").read_text(encoding="utf-8").splitlines()[1:]:
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        moves = re.sub(r"\d+\.+\s*", "", parts[2]).replace("+", "").replace("#", "")
        openings[" ".join(moves.split())] = parts[1]

pieces = {}
for name in ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"]:
    data = (vendor / f"{name}.svg").read_bytes()
    pieces[name] = "data:image/svg+xml;base64," + base64.b64encode(data).decode()

sf = base64.b64encode((vendor / "stockfish.js").read_bytes()).decode()

out = (src.replace("/*CHESSJS*/", chessjs)
          .replace("/*PIECES*/{}", json.dumps(pieces))
          .replace("/*OPENINGS*/{}", json.dumps(openings, ensure_ascii=True))
          .replace("/*SFB64*/", sf))
target = here / "chess-coach.html"
target.write_text(out, encoding="utf-8")
print(f"{target}  {target.stat().st_size/1e6:.2f} MB, {len(openings)} openings")
