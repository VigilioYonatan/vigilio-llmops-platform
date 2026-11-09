#!/usr/bin/env python3
"""Generate contact sheets from frame sequences to visually audit demo animations."""
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
FRAMES_ROOT = REPO_ROOT / "test-results" / "showcase-frames"
OUTPUT_DIR = REPO_ROOT / "docs" / "assets" / "demos"

for clip_dir in sorted(FRAMES_ROOT.iterdir()):
    if not clip_dir.is_dir() or clip_dir.name.endswith("-video"):
        continue
    frames = sorted(clip_dir.glob("frame_*.png"))
    if not frames:
        continue
    
    # Pick up to 12 representative frames
    step = max(1, len(frames) // 12)
    selected_frames = frames[::step][:12]
    
    # 4 columns, 3 rows thumbnail grid
    cols, rows = 4, 3
    thumb_w, thumb_h = 320, 200
    sheet = Image.new("RGB", (cols * thumb_w, rows * thumb_h), "#09090b")
    
    for idx, frame_path in enumerate(selected_frames):
        if idx >= cols * rows:
            break
        c = idx % cols
        r = idx // cols
        with Image.open(frame_path) as im:
            thumb = im.convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (c * thumb_w, r * thumb_h))
            
    out_path = OUTPUT_DIR / f"{clip_dir.name}-contact-sheet.png"
    sheet.save(out_path, optimize=True)
    print(f"[OK] Contact sheet: {out_path.name}")
