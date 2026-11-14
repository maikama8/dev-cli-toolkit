#!/usr/bin/env python3
"""Capture zt stdout from a pty and draw it into a terminal window PNG."""

from __future__ import annotations

import fcntl
import os
import pty
import re
import select
import shutil
import struct
import subprocess
import tempfile
import termios
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
SIZE = 18
ANSI = re.compile(r"\x1b\[([0-9;]*)m")
OTHER = re.compile(r"\x1b\[[0-9;?]*[A-LN-Za-ln-z]|\x1b\][^\x07]*\x07")

BG = (13, 17, 23)
BAR = (22, 27, 34)
BORDER = (48, 54, 61)
FG = (230, 237, 243)
DIM = (139, 148, 158)
GREEN = (126, 231, 135)
YELLOW = (227, 179, 65)
RED = (255, 123, 114)
CYAN = (121, 192, 255)
PROMPT = (126, 231, 135)


def capture(argv: list[str], cwd: Path, env: dict[str, str], stdin_text: str | None = None) -> str:
    master, slave = pty.openpty()
    winsize = struct.pack("HHHH", 40, 120, 0, 0)
    fcntl.ioctl(slave, termios.TIOCSWINSZ, winsize)
    if stdin_text is None:
        proc = subprocess.Popen(argv, stdin=slave, stdout=slave, stderr=slave, cwd=cwd, env=env)
        os.close(slave)
    else:
        read_fd, write_fd = os.pipe()
        proc = subprocess.Popen(argv, stdin=read_fd, stdout=slave, stderr=slave, cwd=cwd, env=env)
        os.close(slave)
        os.close(read_fd)
        os.write(write_fd, stdin_text.encode())
        os.close(write_fd)
    chunks = bytearray()
    while True:
        ready, _, _ = select.select([master], [], [], 0.2)
        if master in ready:
            try:
                chunk = os.read(master, 8192)
            except OSError:
                break
            if not chunk:
                break
            chunks += chunk
        elif proc.poll() is not None:
            while True:
                try:
                    chunk = os.read(master, 8192)
                except OSError:
                    chunk = b""
                if not chunk:
                    break
                chunks += chunk
            break
    proc.wait(timeout=15)
    os.close(master)
    text = chunks.decode("utf-8", "replace").replace("\r\n", "\n").replace("\r", "")
    return OTHER.sub("", text)


def parse(text: str) -> list[list[tuple[str, tuple[int, int, int], bool]]]:
    lines: list[list[tuple[str, tuple[int, int, int], bool]]] = []
    current: list[tuple[str, tuple[int, int, int], bool]] = []
    color = FG
    bold = False
    dim = False

    def paint() -> tuple[int, int, int]:
        return DIM if dim else color

    pos = 0
    for match in ANSI.finditer(text):
        chunk = text[pos : match.start()]
        if chunk:
            current, lines = push(chunk, paint(), bold, current, lines)
        codes = [int(part) for part in match.group(1).split(";") if part] or [0]
        for code in codes:
            if code == 0:
                color, bold, dim = FG, False, False
            elif code == 1:
                bold, dim = True, False
            elif code == 2:
                dim, bold = True, False
            elif code == 22:
                bold = dim = False
            elif code == 31:
                color = RED
            elif code == 32:
                color = GREEN
            elif code == 33:
                color = YELLOW
            elif code == 36:
                color = CYAN
            elif code == 39:
                color = FG
        pos = match.end()
    tail = text[pos:]
    if tail:
        current, lines = push(tail, paint(), bold, current, lines)
    if current:
        lines.append(current)
    return lines


def push(
    chunk: str,
    color: tuple[int, int, int],
    bold: bool,
    current: list[tuple[str, tuple[int, int, int], bool]],
    lines: list[list[tuple[str, tuple[int, int, int], bool]]],
) -> tuple[list, list]:
    parts = chunk.split("\n")
    for index, part in enumerate(parts):
        if part:
            current.append((part, color, bold))
        if index < len(parts) - 1:
            lines.append(current)
            current = []
    return current, lines


def render(prompt: str, body: str, dest: Path) -> None:
    font = ImageFont.truetype(FONT, SIZE)
    bold_font = ImageFont.truetype(FONT_BOLD, SIZE)
    char_w = max(font.getlength("M"), bold_font.getlength("M"))
    line_h = int(SIZE * 1.5)
    parsed = parse(body.rstrip("\n"))
    rows: list[list[tuple[str, tuple[int, int, int], bool]]] = [
        [("$ ", PROMPT, True), (prompt, FG, False)]
    ]
    rows.extend(parsed)
    width_chars = max(24, *(sum(len(part[0]) for part in row) for row in rows))
    pad_x, pad_y = 24, 18
    bar_h = 42
    img_w = int(pad_x * 2 + width_chars * char_w + 12)
    img_h = bar_h + pad_y * 2 + line_h * len(rows) + 10
    image = Image.new("RGB", (img_w, img_h), BG)
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, img_w - 1, img_h - 1), outline=BORDER)
    draw.rectangle((1, 1, img_w - 2, bar_h), fill=BAR)
    for index, dot in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
        cx = 18 + index * 22
        draw.ellipse((cx, 15, cx + 12, 27), fill=dot)
    title = "zt — Zarachtech"
    draw.text(((img_w - font.getlength(title)) / 2, 11), title, font=font, fill=DIM)
    y = bar_h + pad_y
    for row in rows:
        x = float(pad_x)
        for text, color, is_bold in row:
            face = bold_font if is_bold else font
            draw.text((x, y), text, font=face, fill=color)
            x += face.getlength(text)
        y += line_h
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest)


def tool_env() -> dict[str, str]:
    env = os.environ.copy()
    env.pop("NO_COLOR", None)
    env.pop("FORCE_COLOR", None)
    env["TERM"] = "xterm-256color"
    env["COLUMNS"] = "100"
    return env


def main() -> None:
    node = shutil.which("node") or "node"
    binary = str(ROOT / "dist" / "bin.js")
    env = tool_env()
    out = ROOT / "docs" / "images"
    work = Path(tempfile.mkdtemp(prefix="zt-shot-"))

    init_dir = work / "init"
    init_dir.mkdir()
    env_dir = work / "env"
    env_dir.mkdir()
    (env_dir / ".env.example").write_text(
        "PORT=3000\nDATABASE_URL=postgres://localhost/app\nAPI_TOKEN=\n",
        encoding="utf-8",
    )
    (env_dir / ".env").write_text(
        "PORT=3000\nDATABASE_URL=\nAPI_TOKEN=\nDEBUG=1\n",
        encoding="utf-8",
    )
    token = subprocess.check_output(
        [
            node,
            "--input-type=module",
            "-e",
            "import { encodeBase64 } from './dist/lib/base64.js';"
            "const seg = (value) => encodeBase64(JSON.stringify(value), true);"
            "process.stdout.write("
            "seg({ alg: 'HS256', typ: 'JWT' }) + '.' +"
            "seg({ sub: 'ada', name: 'Ada Lovelace', exp: 1700000000 }) +"
            "'.signature-is-not-checked');",
        ],
        cwd=ROOT,
        text=True,
    )
    port_file = work / "port.txt"
    server = subprocess.Popen(
        [
            node,
            "--input-type=module",
            "-e",
            "import { createServer } from 'node:http';"
            "import { writeFileSync } from 'node:fs';"
            "const server = createServer((_req, res) => {"
            "  res.writeHead(200, { 'content-type': 'application/json' });"
            "  res.end(JSON.stringify({ service: 'billing-api', ok: true }));"
            "});"
            "server.listen(0, '127.0.0.1', () => {"
            "  writeFileSync(process.env.PORTFILE, String(server.address().port));"
            "});",
        ],
        env={**env, "PORTFILE": str(port_file)},
    )
    for _ in range(50):
        if port_file.exists():
            break
        server.poll()
        import time

        time.sleep(0.05)
    port = port_file.read_text(encoding="utf-8").strip()

    jobs = [
        ("init", "zt init node-api billing-api", [node, binary, "init", "node-api", "billing-api"], init_dir, None),
        ("env-check", "zt env check", [node, binary, "env", "check"], env_dir, None),
        ("doctor", "zt doctor", [node, binary, "doctor"], work, None),
        ("jwt", "zt jwt decode < token.txt", [node, binary, "jwt", "decode"], work, token + "\n"),
        (
            "http",
            f"zt http http://127.0.0.1:{port}/health",
            [node, binary, "http", f"http://127.0.0.1:{port}/health"],
            work,
            None,
        ),
    ]
    notes = []
    for name, prompt, argv, cwd, stdin_text in jobs:
        body = capture(argv, cwd, env, stdin_text)
        render(prompt, body, out / f"{name}.png")
        block = f"===== {name} =====\n$ {prompt}\n{body.rstrip()}\n"
        notes.append(block)
        print(block)
    (out / "captured.txt").write_text("\n".join(notes), encoding="utf-8")
    server.terminate()


if __name__ == "__main__":
    main()
