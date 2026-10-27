"""Build the original AutoFillCV vector mark and PNG icons without dependencies."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'extension' / 'icons'
GREEN = '#18644c'
WHITE = '#ffffff'
MINT = '#b9efcc'
# All artwork uses the same 128-unit coordinate system for SVG and PNG output.
SHAPES = [
    ('rect', (4, 4, 120, 120, 28), GREEN),
    ('rect', (30, 23, 59, 82, 9), WHITE),
    ('rect', (42, 40, 30, 7, 3.5), GREEN),
    ('rect', (42, 55, 22, 7, 3.5), GREEN),
    ('line', (58, 91, 97, 52, 18), GREEN),
    ('line', (77, 52, 97, 52, 18), GREEN),
    ('line', (97, 52, 97, 72, 18), GREEN),
    ('line', (58, 91, 97, 52, 9), MINT),
    ('line', (77, 52, 97, 52, 9), MINT),
    ('line', (97, 52, 97, 72, 9), MINT),
]


def vector():
    elements = []
    for kind, values, color in SHAPES:
        if kind == 'rect':
            x, y, width, height, radius = values
            elements.append(f'  <rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{color}"/>')
        else:
            x1, y1, x2, y2, width = values
            elements.append(f'  <path d="M{x1} {y1}L{x2} {y2}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">\n' + '\n'.join(elements) + '\n</svg>\n'


def contains(kind, values, x, y):
    if kind == 'rect':
        left, top, width, height, radius = values
        dx = max(left + radius - x, 0, x - (left + width - radius))
        dy = max(top + radius - y, 0, y - (top + height - radius))
        return dx * dx + dy * dy <= radius * radius
    x1, y1, x2, y2, width = values
    dx, dy = x2 - x1, y2 - y1
    t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= (width / 2) ** 2


def png(size):
    # Supersampling keeps the small toolbar sizes smooth with a transparent edge.
    samples = 4
    canvas_size = size * samples
    canvas = bytearray(canvas_size * canvas_size * 4)
    scale = canvas_size / 128
    for kind, values, hex_color in SHAPES:
        color = bytes.fromhex(hex_color[1:]) + b'\xff'
        if kind == 'rect':
            x, y, width, height, _ = values
            bounds = (x, y, x + width, y + height)
        else:
            x1, y1, x2, y2, width = values
            radius = width / 2
            bounds = (min(x1, x2) - radius, min(y1, y2) - radius, max(x1, x2) + radius, max(y1, y2) + radius)
        left, top, right, bottom = bounds
        for py in range(max(0, math.floor(top * scale)), min(canvas_size, math.ceil(bottom * scale))):
            for px in range(max(0, math.floor(left * scale)), min(canvas_size, math.ceil(right * scale))):
                if contains(kind, values, (px + .5) / scale, (py + .5) / scale):
                    offset = (py * canvas_size + px) * 4
                    canvas[offset:offset + 4] = color
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            offsets = [((y * samples + sy) * canvas_size + x * samples + sx) * 4 for sy in range(samples) for sx in range(samples)]
            alpha = sum(canvas[i + 3] for i in offsets)
            if alpha:
                raw.extend(round(sum(canvas[i + c] * canvas[i + 3] for i in offsets) / alpha) for c in range(3))
                raw.append(round(alpha / (samples * samples)))
            else:
                raw.extend(b'\x00\x00\x00\x00')
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'logo.svg').write_text(vector())
    for size in (16, 32, 48, 128, 512):
        (OUT / f'icon-{size}.png').write_bytes(png(size))
    print('Built SVG logo and PNG icons (16, 32, 48, 128, 512).')


if __name__ == '__main__':
    main()
