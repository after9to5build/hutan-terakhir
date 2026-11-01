#!/usr/bin/env python3
"""Rapihin rekaman suara buat game: buang hening di awal/akhir, samain volume, lalu kompres ke .m4a.

Cara pakai (dari folder hutan-terakhir):
    python3 tools/rapihin-suara.py audio-asli/hidup-evaluasi.wav public/audio/teriak-hidup.m4a

Pakai alat bawaan macOS (`afconvert`), gak perlu download apa-apa.
File asli disimpen di audio-asli/ (gak ikut ke web).
"""
import array
import os
import subprocess
import sys
import tempfile
import wave


def main(src, dst, peak_db=-1.0, threshold=0.02, pad_ms=40):
    with tempfile.TemporaryDirectory() as tmp:
        raw = os.path.join(tmp, 'raw.wav')
        # semua format (mp3/m4a/wav) diubah dulu ke WAV 16-bit
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16', src, raw], check=True, capture_output=True)
        with wave.open(raw, 'rb') as w:
            ch, rate, n = w.getnchannels(), w.getframerate(), w.getnframes()
            data = array.array('h', w.readframes(n))
        frames = len(data) // ch
        amp = [max(abs(data[i * ch + c]) for c in range(ch)) / 32768 for i in range(frames)]
        # cari awal & akhir suara (di atas ambang), sisain jeda tipis biar gak kepotong kasar
        start = next((i for i, a in enumerate(amp) if a > threshold), 0)
        end = next((i for i in range(frames - 1, -1, -1) if amp[i] > threshold), frames - 1)
        pad = int(rate * pad_ms / 1000)
        start, end = max(0, start - pad), min(frames, end + pad)
        cut = data[start * ch:end * ch]
        # samain volume: puncak ke peak_db
        peak = max(1, max(abs(x) for x in cut))
        gain = (10 ** (peak_db / 20)) * 32767 / peak
        out = array.array('h', (max(-32768, min(32767, int(x * gain))) for x in cut))
        # fade-out 15 ms biar ujungnya gak "klik"
        fade = int(rate * 0.015)
        for i in range(fade):
            k = 1 - i / fade
            for c in range(ch):
                j = (len(out) // ch - fade + i) * ch + c
                out[j] = int(out[j] * k)
        clean = os.path.join(tmp, 'clean.wav')
        with wave.open(clean, 'wb') as w:
            w.setnchannels(ch)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes(out.tobytes())
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '128000', clean, dst], check=True, capture_output=True)
    print(f'{os.path.basename(dst)}: {frames / rate:.2f} dtk -> {(end - start) / rate:.2f} dtk, volume x{gain:.2f}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
