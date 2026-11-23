#!/usr/bin/env python3
import argparse
import filecmp
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "public/assets/coroa-oficial.png"
GEN = ROOT / "scripts/generate_icons.py"

MAGIC = [
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpeg"),
    (b"RIFF", "webp"),  # checked further below
]


def detect_image(path: Path) -> str:
    with path.open("rb") as f:
        head = f.read(16)
    for sig, kind in MAGIC:
        if head.startswith(sig):
            if kind == "webp":
                with path.open("rb") as f:
                    if f.read(12)[8:12] != b"WEBP":
                        break
            return kind
    raise ValueError("arquivo não parece PNG/JPEG/WEBP válido")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    p = argparse.ArgumentParser(description="Importa a coroa oficial e gera ícones Android com ela.")
    p.add_argument("source", help="caminho da imagem recebida (ex.: /sdcard/Download/coroa-original.png)")
    args = p.parse_args()

    src = Path(args.source).expanduser()
    if not src.is_file():
        print(f"ERRO: origem não encontrada: {src}", file=sys.stderr)
        return 2

    kind = detect_image(src)
    size_src = src.stat().st_size
    hash_src = sha256(src)

    DEST.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, DEST)

    if not DEST.is_file():
        print("ERRO: falha ao gravar destino", file=sys.stderr)
        return 1
    size_dst = DEST.stat().st_size
    hash_dst = sha256(DEST)
    same = (size_src == size_dst and hash_src == hash_dst and filecmp.cmp(src, DEST, shallow=False))

    print(f"origem: {src}")
    print(f"tipo: {kind}")
    print(f"destino: {DEST}")
    print(f"tamanho_origem: {size_src}")
    print(f"tamanho_destino: {size_dst}")
    print(f"sha256: {hash_dst}")
    print(f"copiado_corretamente: {'sim' if same else 'nao'}")
    if not same:
        return 1

    cmd = [sys.executable, str(GEN), str(DEST)]
    print(f"gerando_icones: {' '.join(cmd)}")
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode != 0:
        print("ERRO: geração de ícones falhou", file=sys.stderr)
        return r.returncode

    print("icone_android_configurado: sim (usando exatamente a imagem copiada)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
