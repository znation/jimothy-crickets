// Sprite atlases built by tools/build_atlas.ts (plan §8.4): one painted pose per sprite, animated
// in code. Optional: when an atlas or a frame is missing, the vector art in sprites.ts is used.

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number; // anchor (bottom-center of the body) within the frame, atlas px
  ay: number;
  scale: number; // atlas px per world unit
  image: HTMLImageElement; // filled in at load: frames from several atlases can be merged
}

export interface Atlas {
  frames: Record<string, Frame>;
  backgrounds: Record<string, HTMLImageElement>;
}

/** Load several atlases and merge them; later sets override earlier frames of the same name. */
export async function loadAtlases(sets: string[]): Promise<Atlas | null> {
  const loaded = (await Promise.all(sets.map(loadAtlas))).filter((a): a is Atlas => a !== null);
  if (!loaded.length) return null;
  return {
    frames: Object.assign({}, ...loaded.map((a) => a.frames)),
    backgrounds: Object.assign({}, ...loaded.map((a) => a.backgrounds)),
  };
}

export async function loadAtlas(set: string): Promise<Atlas | null> {
  try {
    const res = await fetch(`./atlas/${set}.json`);
    if (!res.ok) return null;
    const meta = (await res.json()) as { image: string; frames: Record<string, Omit<Frame, "image">>; backgrounds: string[] };
    const [image, ...bgs] = await Promise.all([
      loadImage(`./atlas/${meta.image}`),
      ...meta.backgrounds.map((b) => loadImage(`./atlas/${set}-${b}.webp`)),
    ]);
    return {
      frames: Object.fromEntries(Object.entries(meta.frames).map(([k, f]) => [k, { ...f, image: image! }])),
      backgrounds: Object.fromEntries(meta.backgrounds.map((b, i) => [b, bgs[i]!])),
    };
  } catch {
    return null; // offline before first load, or no atlas yet: vector art it is
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draw a frame with its anchor at the current origin, in world units. `sx`/`sy` squash and
 * stretch around the anchor; `size` scales the whole sprite.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, f: Frame, sx = 1, sy = 1, size = 1) {
  const k = size / f.scale;
  ctx.drawImage(f.image, f.x, f.y, f.w, f.h, -f.ax * k * sx, -f.ay * k * sy, f.w * k * sx, f.h * k * sy);
}

/** The frame's body height in world units (without the outline margin below the anchor). */
export function frameHeight(f: Frame) {
  return f.ay / f.scale;
}
