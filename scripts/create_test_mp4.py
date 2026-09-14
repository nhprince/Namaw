import os
import struct

def create_minimal_mp4(filepath):
    # Minimal ftyp box
    ftyp_data = b'isom' + struct.pack('>I', 512) + b'isomiso2avc1mp41'
    ftyp = struct.pack('>I', len(ftyp_data) + 8) + b'ftyp' + ftyp_data

    # Minimal mdat box (dummy video payload)
    mdat_data = b'\x00' * 1024
    mdat = struct.pack('>I', len(mdat_data) + 8) + b'mdat' + mdat_data

    # Minimal moov box
    # mvhd
    mvhd_data = (
        b'\x00' * 4 +        # version & flags
        struct.pack('>I', 0) + # creation time
        struct.pack('>I', 0) + # mod time
        struct.pack('>I', 1000) + # timescale
        struct.pack('>I', 2000) + # duration (2s)
        b'\x00\x01\x00\x00' +  # rate 1.0
        b'\x01\x00' +          # volume 1.0
        b'\x00' * 10 +         # reserved
        b'\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' +
        b'\x00\x00\x00\x00\x00\x01\x00\x00\x00\x00\x00\x00' +
        b'\x00\x00\x00\x00\x00\x00\x00\x00\x40\x00\x00\x00' + # matrix
        b'\x00' * 24 +         # pre-defined
        struct.pack('>I', 2)   # next_track_id
    )
    mvhd = struct.pack('>I', len(mvhd_data) + 8) + b'mvhd' + mvhd_data
    moov = struct.pack('>I', len(mvhd) + 8) + b'moov' + mvhd

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'wb') as f:
        f.write(ftyp + mdat + moov)
    print(f'Created test MP4 at {filepath}')

if __name__ == '__main__':
    create_minimal_mp4('site-fixtures/public/media/sample.mp4')
