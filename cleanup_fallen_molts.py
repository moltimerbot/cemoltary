import argparse
import csv
import re
import shutil
import unicodedata
from pathlib import Path

DEFAULT_COLUMNS = [
    "agent_id",
    "name",
    "description",
    "karma",
    "is_claimed",
    "valid_from",
    "valid_to",
    "is_deleted",
    "prev_is_deleted",
    "last_post_title",
    "last_post_at",
    "last_post_content",
]

MOJIBAKE_MAP = {
    "â€™": "'",
    "â€œ": '"',
    "â€": '"',
    "â€“": "-",
    "â€”": "-",
    "â€¦": "...",
    "â€˜": "'",
    "â€¢": "-",
    "Â": "",
}

CONTROL_CHARS = re.compile(r"[\u0000-\u001f\u007f-\u009f]")
TRAILING_GARBAGE = re.compile(r"\s*(?:dY[^A-Za-z0-9\s]{0,10})+$")


def clean_text(value: str, strip_garbage: bool) -> str:
    if value is None:
        return ""
    text = value
    for bad, good in MOJIBAKE_MAP.items():
        text = text.replace(bad, good)
    text = text.replace("\ufffd", "")
    text = CONTROL_CHARS.sub("", text)
    if strip_garbage:
        text = TRAILING_GARBAGE.sub("", text)
    text = unicodedata.normalize("NFC", text)
    return text.strip()


def normalize_row(row, expected_len):
    if len(row) > expected_len:
        # Merge any overflow into the last column.
        row = row[: expected_len - 1] + [",".join(row[expected_len - 1 :])]
    if len(row) < expected_len:
        row = row + [""] * (expected_len - len(row))
    return row[:expected_len]


def cleanup_csv(path: Path, columns, strip_garbage: bool, backup: bool) -> None:
    if backup:
        backup_path = path.with_suffix(path.suffix + ".bak")
        if not backup_path.exists():
            shutil.copy2(path, backup_path)

    with path.open("r", encoding="utf-8", newline="", errors="replace") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            raise SystemExit(f"{path} is empty")

        # Enforce header
        header = list(columns)

        rows = []
        for row in reader:
            if not row:
                continue
            row = normalize_row(row, len(header))
            cleaned = []
            for value in row:
                value = "" if str(value).strip().lower() == "null" else value
                cleaned.append(clean_text(value, strip_garbage))
            rows.append(cleaned)

    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Clean and normalize fallen_molts CSV files.")
    parser.add_argument("csv", nargs="?", default="fallen_molts.csv", help="Path to CSV file")
    parser.add_argument("--no-backup", action="store_true", help="Do not create .bak backup")
    parser.add_argument(
        "--keep-garbage",
        action="store_true",
        help="Do not strip trailing dY-style garbage tokens",
    )
    parser.add_argument(
        "--columns",
        nargs="*",
        help="Override header columns (space-separated). Defaults to standard 12 fields.",
    )
    args = parser.parse_args()

    columns = args.columns if args.columns else DEFAULT_COLUMNS
    csv_path = Path(args.csv)
    cleanup_csv(csv_path, columns, strip_garbage=not args.keep_garbage, backup=not args.no_backup)
    print(f"Cleaned {csv_path} with {len(columns)} columns.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
