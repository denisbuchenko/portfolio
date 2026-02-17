#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def _load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def _merge_character(character_id: str, base_dir: Path) -> tuple[dict, list[Path]]:
    act_objects: list[dict] = []
    source_paths: list[Path] = []
    character_info: dict | None = None

    for act in (1, 2, 3):
        path = base_dir / f"{character_id}_act{act}.json"
        data = _load_json(path)

        _require(data.get("characterId") == character_id, f"{path}: characterId != {character_id}")
        _require("characterInfo" in data, f"{path}: missing characterInfo")
        _require(isinstance(data.get("dialogueTree"), list), f"{path}: dialogueTree must be an array")
        _require(len(data["dialogueTree"]) == 1, f"{path}: dialogueTree must contain exactly 1 act object")

        if character_info is None:
            character_info = data["characterInfo"]
        else:
            _require(
                data["characterInfo"] == character_info,
                f"{path}: characterInfo differs between acts (expected identical)",
            )

        act_objects.append(data["dialogueTree"][0])
        source_paths.append(path)

    merged = {
        "characterId": character_id,
        "characterInfo": character_info,
        "dialogueTree": act_objects,
    }
    return merged, source_paths


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Merge <character>_act1..3.json into <character>.json (dialogueTree contains 3 act objects)."
    )
    parser.add_argument(
        "--dir",
        default=".",
        help="Directory with *_act*.json files (default: current directory).",
    )
    parser.add_argument(
        "--characters",
        nargs="*",
        default=["fyfchik", "pipiser", "shoragran"],
        help="Character ids to merge (default: fyfchik pipiser shoragran).",
    )
    parser.add_argument(
        "--delete-acts",
        action="store_true",
        help="Delete source *_act*.json files after successful merge.",
    )
    args = parser.parse_args()

    base_dir = Path(args.dir).resolve()
    _require(base_dir.is_dir(), f"--dir must be a directory: {base_dir}")

    for character_id in args.characters:
        merged, source_paths = _merge_character(character_id, base_dir)
        out_path = base_dir / f"{character_id}.json"
        out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {out_path}")

        if args.delete_acts:
            for p in source_paths:
                p.unlink(missing_ok=False)
                print(f"Deleted {p}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

