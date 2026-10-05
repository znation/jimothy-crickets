import { describe, expect, it } from "vitest";
import manifest from "../src/data/audio.json";
import { loopPoints } from "../src/platform/audio.ts";

// Sample counts measured by decoding the built happy-clappy loop in Chromium at 44.1 kHz.
const LOOP = manifest.music["happy-clappy"].seconds; // 769 132 samples
const sr = 44100;

describe("music loop points", () => {
  it("loops the whole buffer when the decoder honored the edit list", () => {
    expect(loopPoints(769_104 / sr, LOOP)).toEqual([0, 0]); // AAC, edit list applied
    expect(loopPoints(769_132 / sr, LOOP)).toEqual([0, 0]); // Ogg Vorbis
  });

  it("skips the encoder priming when the decoder left it in", () => {
    const [start, end] = loopPoints(770_156 / sr, LOOP); // the same AAC without its edit list
    expect(start * sr).toBeCloseTo(1024, 3);
    expect(end - start).toBeCloseTo(LOOP, 9);
  });

  it("never skips more than the priming, even with trailing padding", () => {
    const [start, end] = loopPoints((769_132 + 1024 + 900) / sr, LOOP);
    expect(start * sr).toBeCloseTo(1024, 3);
    expect(end * sr).toBeCloseTo(769_132 + 1024, 3);
  });
});
