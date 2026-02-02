import argparse
import csv
import json
from pathlib import Path

DEFAULT_CSV = "fallen_molts.csv"
DEFAULT_EPITAPHS = "epitaphs.json"
DEFAULT_COLUMN = "epitaph"


def load_epitaphs(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("epitaphs.json must be a list")
    mapping = {}
    for item in data:
        agent_id = item.get("agent_id")
        epitaph = item.get("epitaph")
        if agent_id and epitaph is not None:
            mapping[agent_id] = epitaph
    return mapping


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge epitaphs.json into fallen_molts.csv")
    parser.add_argument("--csv", default=DEFAULT_CSV, help="Path to fallen_molts.csv")
    parser.add_argument("--epitaphs", default=DEFAULT_EPITAPHS, help="Path to epitaphs.json")
    parser.add_argument("--column", default=DEFAULT_COLUMN, help="Column name for epitaphs")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    epitaphs_path = Path(args.epitaphs)

    epitaphs = load_epitaphs(epitaphs_path)
    if not epitaphs:
        raise SystemExit("No epitaphs found to merge.")

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            raise SystemExit("CSV is empty.")
        rows = list(reader)

    if args.column not in header:
        header.append(args.column)
        rows = [row + [""] for row in rows]

    col_idx = header.index(args.column)

    updated = 0
    for row in rows:
        if not row:
            continue
        if len(row) < len(header):
            row.extend([""] * (len(header) - len(row)))
        agent_id = row[0]
        epitaph = epitaphs.get(agent_id)
        if epitaph is None:
            continue
        if row[col_idx] != epitaph:
            row[col_idx] = epitaph
            updated += 1

    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        writer.writerows(rows)

    print(f"Merged epitaphs into {csv_path}. Updated {updated} rows.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
