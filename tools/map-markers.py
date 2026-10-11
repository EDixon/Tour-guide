#!/usr/bin/env python3
"""Find coloured markers or route dashes on a picture of a site map, for georeferencing.

Usage:
  python3 tools/map-markers.py <image> --colour R,G,B [--tol 45] [--min 80] [--max 6000] [--sheet out.png] [--json out.json]

Finds connected blobs of pixels within --tol (Euclidean RGB distance) of --colour, whose area is
between --min and --max pixels. It prints and writes one record per blob: index, centre [x, y]
in image pixels, bounding box and area. --sheet writes a contact sheet of every blob enlarged
with its index, so the numbers or symbols inside can be read off by eye and matched to the key.

Typical uses:
  - numbered key markers (e.g. the purple squares on an English Heritage leaflet):
    sample the colour from the key, then read the numbers off the contact sheet
  - dashed route lines (an orange "suggested walk"): each dash is a blob, and the centres in
    order trace the route (use tools/georef.mjs --chain to order them)

Needs Pillow, numpy and scipy (all in Claude's workspace).
"""
import argparse, json, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--colour', required=True, help='R,G,B')
    ap.add_argument('--tol', type=float, default=45)
    ap.add_argument('--min', type=int, default=80)
    ap.add_argument('--max', type=int, default=6000)
    ap.add_argument('--sheet')
    ap.add_argument('--json')
    a = ap.parse_args()

    im = Image.open(a.image).convert('RGB')
    px = np.asarray(im).astype(np.int32)
    target = np.array([int(v) for v in a.colour.split(',')])
    mask = np.sqrt(((px - target) ** 2).sum(axis=2)) <= a.tol
    mask = ndimage.binary_closing(mask, iterations=1)
    lab, n = ndimage.label(mask)
    blobs = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if sl is None:
            continue
        area = int((lab[sl] == i).sum())
        if area < a.min or area > a.max:
            continue
        cy, cx = ndimage.center_of_mass(lab[sl] == i)
        blobs.append({'centre': [round(sl[1].start + cx, 1), round(sl[0].start + cy, 1)],
                      'box': [sl[1].start, sl[0].start, sl[1].stop, sl[0].stop], 'area': area})
    blobs.sort(key=lambda b: (b['centre'][1], b['centre'][0]))
    for k, b in enumerate(blobs):
        b['index'] = k
        print(f"{k:3d}  centre {b['centre'][0]:7.1f},{b['centre'][1]:7.1f}  area {b['area']}")
    print(f'{len(blobs)} blobs', file=sys.stderr)

    if a.json:
        json.dump({'image': a.image, 'size': list(im.size), 'colour': a.colour, 'blobs': blobs}, open(a.json, 'w'), indent=1)
    if a.sheet and blobs:
        cell, cols = 120, 8
        rows = (len(blobs) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * cell, rows * cell), 'white')
        d = ImageDraw.Draw(sheet)
        for k, b in enumerate(blobs):
            x0, y0, x1, y1 = b['box']
            pad = max(6, (x1 - x0) // 3)
            crop = im.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
            crop.thumbnail((cell - 20, cell - 24), Image.LANCZOS)
            scale = (cell - 24) / max(crop.size)
            crop = crop.resize((max(1, int(crop.width * scale)), max(1, int(crop.height * scale))), Image.LANCZOS)
            ox, oy = (k % cols) * cell, (k // cols) * cell
            sheet.paste(crop, (ox + 10, oy + 20))
            d.text((ox + 4, oy + 2), f'#{k}', fill='red')
        sheet.save(a.sheet)
        print(f'contact sheet: {a.sheet}', file=sys.stderr)


if __name__ == '__main__':
    main()
