"""List manifest documents for given project ids with their resolved library path.

usage: python -I list_docs.py [--lib LIB] P01 P08 ...   (no ids = all; prints unresolved count)
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refs_common import lib_root, resolve_documents  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--lib")
ap.add_argument("ids", nargs="*")
a = ap.parse_args()
lib = lib_root(a.lib)
man, docs = resolve_documents(lib)
missing = sum(1 for d in docs if not d["file"])
for i, d in enumerate(docs):
    if a.ids and d["project_id"] not in a.ids:
        continue
    print(f'{i}\t{d["project_id"]}\t{d["pages"]}p\t{d["document_kind"]}\t{d["document_title"][:60]}\t{d["file"]}')
print(f"# unresolved documents: {missing}/{len(docs)}", file=sys.stderr)
