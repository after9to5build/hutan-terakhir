#!/usr/bin/env python3
"""Kompres tekstur model Meshy biar game ringan di web.

Cara pakai (dari folder hutan-terakhir):
    python3 tools/kompres-glb.py models-asli/presiden.glb public/models/presiden.glb 2048

- Baca file GLB asli, ubah tiap tekstur PNG jadi JPEG lewat `sips` (bawaan macOS).
- Tekstur warna (baseColor) dikecilin ke ukuran yang diminta (2048 / 1024).
- Tekstur kilap/kasar (metallic-roughness) cukup 512.
- Geometri, kerangka, dan animasi gak diubah sama sekali.
File asli disimpen di models-asli/ (gak ikut ke web).
"""
import json
import os
import struct
import subprocess
import sys
import tempfile


def to_jpeg(png_bytes, max_size, quality):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'in.png')
        dst = os.path.join(tmp, 'out.jpg')
        open(src, 'wb').write(png_bytes)
        subprocess.run(['sips', '-Z', str(max_size), '-s', 'format', 'jpeg',
                        '-s', 'formatOptions', str(quality), src, '--out', dst],
                       check=True, capture_output=True)
        return open(dst, 'rb').read()


def pad4(b, fill=b'\0'):
    return b + fill * ((4 - len(b) % 4) % 4)


def main(src, dst, color_size):
    data = open(src, 'rb').read()
    json_len = struct.unpack('<I', data[12:16])[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8
    bin_len = struct.unpack('<I', data[20 + json_len:24 + json_len])[0]
    blob = data[bin_start:bin_start + bin_len]

    # Tekstur mana yang dipakai buat metallic-roughness (cukup kecil)
    mr_images = set()
    for m in gltf.get('materials', []):
        t = m.get('pbrMetallicRoughness', {}).get('metallicRoughnessTexture')
        if t is not None:
            mr_images.add(gltf['textures'][t['index']]['source'])

    # Ganti isi bufferView gambar
    replaced = {}
    for i, img in enumerate(gltf.get('images', [])):
        bv = gltf['bufferViews'][img['bufferView']]
        off = bv.get('byteOffset', 0)
        raw = blob[off:off + bv['byteLength']]
        if i in mr_images:
            new = to_jpeg(raw, 512, 80)
        else:
            new = to_jpeg(raw, color_size, 85)
        replaced[img['bufferView']] = new
        img['mimeType'] = 'image/jpeg'

    # Susun ulang buffer biner: tiap bufferView ditaruh berurutan, rata 4 byte
    out = bytearray()
    for idx, bv in enumerate(gltf['bufferViews']):
        off = bv.get('byteOffset', 0)
        chunk = replaced.get(idx, blob[off:off + bv['byteLength']])
        while len(out) % 4:
            out.append(0)
        bv['byteOffset'] = len(out)
        bv['byteLength'] = len(chunk)
        out += chunk
    out = pad4(bytes(out))
    gltf['buffers'][0]['byteLength'] = len(out)

    js = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON'))
        f.write(js)
        f.write(struct.pack('<I4s', len(out), b'BIN\0'))
        f.write(out)
    print(f'{os.path.basename(dst)}: {len(data) / 1e6:.1f} MB -> {total / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1024)
