#!/usr/bin/env python3
"""Buang data yang gak kepake dari file GLB biar lebih cepat didownload.

Cara pakai (dari folder hutan-terakhir):
    python3 tools/rampingin-glb.py public/models/presiden.glb public/models/presiden.glb \
        --buang-animasi Funky_Walk_inplace,Joyful_Dance_with_Hand_Sway,run_fast_10_inplace

- Animasi yang disebut di --buang-animasi dihapus (cek dulu gak dipanggil di src/ mana pun).
- Data TANGENT dihapus kalau materialnya gak pakai normal map (tanpa normal map, tangent gak dipakai).
- Data biner yang udah gak dirujuk ikut dibuang, sisanya disusun ulang.
Geometri, kerangka, tekstur, dan animasi lain gak diubah.
Jalanin setelah tools/kompres-glb.py (urutan: kompres tekstur dulu, baru rampingin).
"""
import argparse
import json
import struct


def pad4(b, fill=b'\0'):
    return b + fill * ((4 - len(b) % 4) % 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--buang-animasi', default='')
    args = ap.parse_args()
    drop_anims = {n for n in args.buang_animasi.split(',') if n}

    data = open(args.src, 'rb').read()
    json_len = struct.unpack('<I', data[12:16])[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8
    bin_len = struct.unpack('<I', data[20 + json_len:24 + json_len])[0]
    blob = data[bin_start:bin_start + bin_len]

    # 1. Buang animasi
    before = [a['name'] for a in gltf.get('animations', [])]
    gltf['animations'] = [a for a in gltf.get('animations', []) if a['name'] not in drop_anims]
    missing = drop_anims - set(before)
    if missing:
        raise SystemExit(f'Animasi gak ketemu: {sorted(missing)}')

    # 2. Buang TANGENT kalau gak ada normal map
    uses_normal_map = any('normalTexture' in m for m in gltf.get('materials', []))
    if not uses_normal_map:
        for mesh in gltf['meshes']:
            for prim in mesh['primitives']:
                prim['attributes'].pop('TANGENT', None)
                for t in prim.get('targets', []):
                    t.pop('TANGENT', None)

    # 3. Kumpulin accessor & bufferView yang masih dirujuk
    used_acc = set()
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            used_acc.update(prim['attributes'].values())
            if 'indices' in prim:
                used_acc.add(prim['indices'])
            for t in prim.get('targets', []):
                used_acc.update(t.values())
    for skin in gltf.get('skins', []):
        if 'inverseBindMatrices' in skin:
            used_acc.add(skin['inverseBindMatrices'])
    for anim in gltf['animations']:
        for s in anim['samplers']:
            used_acc.update((s['input'], s['output']))

    acc_map = {old: new for new, old in enumerate(sorted(used_acc))}
    accessors = [gltf['accessors'][i] for i in sorted(used_acc)]
    used_bv = {a['bufferView'] for a in accessors if 'bufferView' in a}
    used_bv.update(img['bufferView'] for img in gltf.get('images', []) if 'bufferView' in img)
    bv_map = {old: new for new, old in enumerate(sorted(used_bv))}

    # 4. Tulis ulang rujukan
    for a in accessors:
        if 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]
    gltf['accessors'] = accessors
    for img in gltf.get('images', []):
        if 'bufferView' in img:
            img['bufferView'] = bv_map[img['bufferView']]
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            prim['attributes'] = {k: acc_map[v] for k, v in prim['attributes'].items()}
            if 'indices' in prim:
                prim['indices'] = acc_map[prim['indices']]
            prim['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in prim.get('targets', [])]
            if not prim['targets']:
                del prim['targets']
    for skin in gltf.get('skins', []):
        if 'inverseBindMatrices' in skin:
            skin['inverseBindMatrices'] = acc_map[skin['inverseBindMatrices']]
    for anim in gltf['animations']:
        for s in anim['samplers']:
            s['input'] = acc_map[s['input']]
            s['output'] = acc_map[s['output']]
    if not gltf['animations']:
        del gltf['animations']

    # 5. Susun ulang buffer biner
    out = bytearray()
    new_bvs = []
    for old in sorted(used_bv):
        bv = gltf['bufferViews'][old]
        off = bv.get('byteOffset', 0)
        chunk = blob[off:off + bv['byteLength']]
        while len(out) % 4:
            out.append(0)
        bv['byteOffset'] = len(out)
        out += chunk
        new_bvs.append(bv)
    gltf['bufferViews'] = new_bvs
    out = pad4(bytes(out))
    gltf['buffers'][0]['byteLength'] = len(out)

    js = pad4(json.dumps(gltf, separators=(',', ':')).encode(), b' ')
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(args.dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack('<II', len(out), 0x004E4942))
        f.write(out)
    print(f'{args.src}: {len(data) / 1e6:.2f} MB → {args.dst}: {total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
