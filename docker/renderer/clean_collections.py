#!/usr/bin/env python3

import shutil
from pathlib import Path

import ansible_collections  # pyright: ignore[reportMissingImports]

root = Path(ansible_collections.__path__[0])

for namespace in root.iterdir():
    if not namespace.is_dir():
        continue
    for collection in namespace.iterdir():
        if not collection.is_dir():
            continue
        for path in collection.iterdir():
            if path.name != "plugins":
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            else:
                modules = path / "modules"
                if modules.is_dir():
                    shutil.rmtree(modules)
