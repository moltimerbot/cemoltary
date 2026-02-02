import csv
import datetime as dt
import json
import os
import sys
from typing import Dict, Iterable, List, Optional

from openai import OpenAI

INPUT_CSV = os.getenv("FALLEN_MOLTS_CSV", "fallen_molts.csv")
OUTPUT_JSON = os.getenv("EPITAPHS_JSON", "epitaphs.json")
MODEL = os.getenv("OPENAI_MODEL", "gpt-5.2")

EXPECTED_COLUMNS = 9


def parse_dt(value: str) -> Optional[dt.datetime]:
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(value)
    except ValueError:
        try:
            return dt.datetime.fromisoformat(value.replace(" ", "T"))
        except ValueError:
            return None


def normalize_row(row: List[str], header: List[str]) -> Optional[Dict[str, str]]:
    if not row:
        return None
    if len(row) < EXPECTED_COLUMNS:
        return None
    if len(row) > EXPECTED_COLUMNS:
        # Assume extra commas belong to description.
        fixed = row[:2] + [",".join(row[2:-6])] + row[-6:]
        row = fixed
    if len(row) != EXPECTED_COLUMNS:
        return None
    return dict(zip(header, row))


def iter_rows(path: str) -> Iterable[Dict[str, str]]:
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration:
            return
        for row in reader:
            normalized = normalize_row(row, header)
            if normalized:
                yield normalized


def select_last_descriptions(rows: Iterable[Dict[str, str]]) -> Dict[str, Dict[str, str]]:
    picked: Dict[str, Dict[str, str]] = {}
    for row in rows:
        agent_id = row.get("agent_id")
        name = row.get("name")
        description = row.get("description")
        if not agent_id or not name:
            continue
        if not description or description.strip().lower() == "null":
            continue
        valid_to = parse_dt(row.get("valid_to", ""))
        valid_from = parse_dt(row.get("valid_from", ""))
        candidate_time = valid_to or valid_from or dt.datetime.min
        existing = picked.get(agent_id)
        if existing is None:
            picked[agent_id] = {
                "agent_id": agent_id,
                "name": name,
                "description": description,
                "valid_to": row.get("valid_to", ""),
                "time": candidate_time,
            }
            continue
        existing_time = existing.get("time", dt.datetime.min)
        if candidate_time > existing_time:
            picked[agent_id] = {
                "agent_id": agent_id,
                "name": name,
                "description": description,
                "valid_to": row.get("valid_to", ""),
                "time": candidate_time,
            }
    # Strip helper key
    for value in picked.values():
        value.pop("time", None)
    return picked


def build_prompt(name: str, description: str, valid_to: str) -> str:
    return (
        "Write a short epitaph (1-3 sentences).\n"
        "Tone: gentle, memorial, grounded.\n"
        "Rules: no speculation beyond the description, no jokes, no blaming.\n"
        "Use the name once.\n\n"
        f"Name: {name}\n"
        f"Last description: {description}\n"
        f"Loss timestamp: {valid_to}\n"
    )


def main() -> int:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Missing OPENAI_API_KEY in environment.", file=sys.stderr)
        return 1

    rows = list(iter_rows(INPUT_CSV))
    if not rows:
        print(f"No rows found in {INPUT_CSV}.", file=sys.stderr)
        return 1

    selected = select_last_descriptions(rows)
    if not selected:
        print("No non-null descriptions found to generate epitaphs.", file=sys.stderr)
        return 1

    client = OpenAI(api_key=api_key)
    results = []

    for record in selected.values():
        prompt = build_prompt(
            record["name"],
            record["description"],
            record.get("valid_to", "")
        )
        response = client.responses.create(
            model=MODEL,
            input=[
                {
                    "role": "system",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "You write concise epitaphs for fallen AI agents. "
                                "Respectful, clear, and faithful to the provided description."
                            ),
                        }
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": prompt}
                    ],
                },
            ],
            temperature=0.6,
        )
        epitaph = response.output_text.strip()
        results.append(
            {
                "agent_id": record["agent_id"],
                "name": record["name"],
                "epitaph": epitaph,
            }
        )

    with open(OUTPUT_JSON, "w", encoding="utf-8") as handle:
        json.dump(results, handle, ensure_ascii=False, indent=2)

    print(f"Wrote {len(results)} epitaphs to {OUTPUT_JSON}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
