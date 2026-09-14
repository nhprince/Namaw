import os
import zlib
import struct

def make_png(width, height, color_func):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            r, g, b, a = color_func(x, y, width, height)
            raw_data.extend([r, g, b, a])

    compressed = zlib.compress(bytes(raw_data), 9)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    
    png = (
        b'\x89PNG\r\n\x1a\n' +
        chunk(b'IHDR', ihdr) +
        chunk(b'IDAT', compressed) +
        chunk(b'IEND', b'')
    )
    return png

def icon_color(x, y, w, h):
    # Normalized coords [0, 1]
    nx = x / (w - 1) if w > 1 else 0.5
    ny = y / (h - 1) if h > 1 else 0.5
    
    # Distance from center
    cx, cy = 0.5, 0.5
    dx, dy = nx - cx, ny - cy
    dist = (dx*dx + dy*dy) ** 0.5
    
    # Rounded rectangle mask
    corner_radius = 0.28
    rect_x = max(0.0, abs(dx) - (0.5 - corner_radius))
    rect_y = max(0.0, abs(dy) - (0.5 - corner_radius))
    corner_dist = (rect_x*rect_x + rect_y*rect_y) ** 0.5
    
    if corner_dist > corner_radius:
        return 0, 0, 0, 0
    
    # Vibrant Indigo/Violet Gradient
    # Top-left to bottom-right
    t = (nx + ny) / 2.0
    r = int(99 + (79 - 99) * t)
    g = int(102 + (70 - 102) * t)
    b = int(241 + (229 - 241) * t)
    
    # Draw download arrow / play symbol in white
    # Arrow stem: center horizontal line from ny=0.25 to ny=0.55
    in_stem = (abs(nx - 0.5) <= 0.08) and (0.22 <= ny <= 0.55)
    # Arrow head: triangle from ny=0.45 to ny=0.72
    in_head = (ny >= 0.45 and ny <= 0.72) and (abs(nx - 0.5) <= (0.72 - ny) * 1.1)
    # Bottom bar: ny=0.78 to 0.86, nx between 0.25 and 0.75
    in_bar = (0.78 <= ny <= 0.85) and (0.24 <= nx <= 0.76)
    
    if in_stem or in_head or in_bar:
        return 255, 255, 255, 255
        
    return r, g, b, 255

def main():
    sizes = [16, 48, 128]
    targets = [
        'extension/src/public/icons',
        'extension/public/icons'
    ]
    for target in targets:
        os.makedirs(target, exist_ok=True)
        for size in sizes:
            png_bytes = make_png(size, size, icon_color)
            filepath = os.path.join(target, f'icon-{size}.png')
            with open(filepath, 'wb') as f:
                f.write(png_bytes)
            print(f'Generated {filepath} ({size}x{size})')

if __name__ == '__main__':
    main()
