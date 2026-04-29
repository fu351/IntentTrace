from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def test_verify_cli_outputs_expected_top_level_keys() -> None:
  repo_root = Path(__file__).resolve().parents[2]
  command = [
    sys.executable,
    str(repo_root / "analyzer" / "main.py"),
    "verify",
    "--code",
    str(repo_root / "analyzer" / "fixtures" / "simple_plot.py"),
    "--intent",
    str(repo_root / "analyzer" / "fixtures" / "intent_mean_bar.json"),
  ]

  completed = subprocess.run(
    command,
    cwd=repo_root,
    check=True,
    capture_output=True,
    text=True,
  )

  payload = json.loads(completed.stdout)
  assert set(payload) == {
    "programNodes",
    "sinks",
    "selectedSink",
    "slicingCriterion",
    "slice",
    "semanticOps",
    "warnings",
    "flowGraph",
  }
