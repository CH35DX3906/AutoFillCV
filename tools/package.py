"""Build a dependency-free, unpackable Chrome extension archive."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "extension/manifest.json").read_text())["version"]
output = root / f"AutoFillCV-v{version}.zip"
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for path in sorted((root / "extension").rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(root / "extension"))
print(f"Created {output.name}")
