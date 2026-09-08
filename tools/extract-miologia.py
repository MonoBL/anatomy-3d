#!/usr/bin/env python3
"""Reads the Portuguese myology table out of a PDF into data/miologia-raw.json.

The table is 'Músculo | Origem | Inserção | Ação'. pdfplumber finds the real
cell rectangles, so the only work here is the header (to locate the columns),
the section headings, and the rows whose muscle cell is empty because the row
above continues into them.

    pip install pdfplumber
    python3 tools/extract-miologia.py ~/Downloads/Tabela\\ Miologia.pdf

The output is course material and stays local: data/ is gitignored, and only
the names it maps to (tools/pt-muscles.mjs) live in the repo.
"""
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent


def clean(cell):
    return re.sub(r"\s+", " ", (cell or "").replace("\n", " ")).strip()


def extract(path):
    rows, group, cols = [], None, None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.find_tables():
                # The table runs across pages without repeating its header, so
                # the column positions carry over until a new header appears.
                for raw in table.extract():
                    cells = [clean(c) for c in raw]
                    joined = " ".join(c for c in cells if c)
                    if not joined or "Estrutura e Função" in joined:
                        continue
                    if "Músculo" in cells and "Origem" in cells:
                        cols = (cells.index("Músculo"), cells.index("Origem"),
                                cells.index("Inserção"), cells.index("Ação"))
                        continue
                    if re.match(r"^Músculos?\s+d[oea]\b", joined):
                        group = joined
                        continue
                    if cols is None:
                        continue
                    m, o, i, a = (cells[c] if c < len(cells) else "" for c in cols)
                    if m:
                        rows.append({"group": group, "muscle": m,
                                     "origem": o, "insercao": i, "acao": a})
                    elif rows:
                        last = rows[-1]
                        for key, val in (("origem", o), ("insercao", i), ("acao", a)):
                            if val:
                                last[key] = f"{last[key]} {val}".strip()
    for row in rows:
        for key in ("origem", "insercao", "acao"):
            row[key] = re.sub(r"\s+", " ", row[key]).strip()
    return rows


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rows = extract(sys.argv[1])
    out = ROOT / "data" / "miologia-raw.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf8")
    groups = {}
    for row in rows:
        groups[row["group"]] = groups.get(row["group"], 0) + 1
    print(f"{len(rows)} muscles -> {out.relative_to(ROOT)}")
    for group, n in groups.items():
        print(f"  {n:3}  {group}")


if __name__ == "__main__":
    main()
