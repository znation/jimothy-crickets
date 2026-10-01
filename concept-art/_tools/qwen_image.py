#!/usr/bin/env python3
"""
qwen_image.py — Low-VRAM Qwen-Image-2.1 runner for VALE asset generation.

The GPU (Radeon Pro Vega 48, 8 GiB, gfx900) also drives the display. Running
this with a 4.5 GiB allocator cap *plus* a second GPU process once pushed the
card to ~7 GiB and corrupted the display, so the limits are deliberately tight
and apply to the whole card, not just this process:

  * Only one generation process may use the GPU at a time (a lock file).
  * It refuses to start if the card already has more than
    DEVICE_VRAM_LIMIT_GIB - PROCESS_VRAM_LIMIT_GIB in use (display, browser, ...).
  * PyTorch's caching allocator is capped at ALLOCATOR_GIB, so an oversized
    tensor raises OOM instead of growing.
  * A watchdog thread polls every 0.1 s and hard-exits (freeing everything) if
      - this process holds more than PROCESS_VRAM_LIMIT_GIB of VRAM (the kernel's
        per-process accounting in /proc/self/fdinfo, which includes the HIP
        context), or more than PROCESS_GTT_LIMIT_GIB of GPU-mapped system RAM, or
      - the whole card goes above DEVICE_VRAM_LIMIT_GIB (mem_info_vram_used).
  * Nothing is pinned: page-locked host buffers are GPU-mapped (GTT) memory the
    display also depends on.

Neither the 8B text encoder (17.5 GB) nor the 7B DiT (14.2 GB) fits, so both
(and the VAE) are streamed through the GPU with diffusers group offloading.
They also can't share the 39 GB of system RAM, so generation runs in two
stages: every prompt is encoded first, the text encoder is freed, then the DiT
and VAE are loaded.

Needs its own venv (diffusers from git, transformers>=5.17), separate from
~/venv so the older tools there keep working:

    python3 -m venv ~/venv-qwenimage
    ~/venv-qwenimage/bin/pip install torch==2.9.1 torchvision==0.24.1 \\
        --index-url https://download.pytorch.org/whl/rocm6.3
    ~/venv-qwenimage/bin/pip install "transformers>=5.17" accelerate pillow \\
        numpy scipy "git+https://github.com/huggingface/diffusers"

Quick test:
    ~/venv-qwenimage/bin/python tools/asset_gen/qwen_image.py \\
        --prompt "a rusty iron longsword" --transparent --size 512 --output /tmp/sword.png
"""

import argparse
import fcntl
import gc
import glob
import os
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

MODEL_ID = "Qwen/Qwen-Image-2.1"

# The allocator cap below leaves little slack, so keep big cached blocks whole instead of
# splitting them into fragments a later, larger request can't use (gfx900 has no
# expandable_segments). Must be set before torch initializes the GPU.
os.environ.setdefault("PYTORCH_ALLOC_CONF", "max_split_size_mb:128,garbage_collection_threshold:0.7")

# Condition images are resized to at most this side: the sprites they show are 16-32 pixels,
# and a full 1024x1024 reference quadruples the encoder's and the DiT's work for nothing.
# It is a budget for all of a job's condition images together: the DiT keeps their keys and
# values for every layer on the GPU through the whole run (0.5 MiB per token, 1024 tokens for
# a 512x512 image), and two full-size references overflowed the allocator cap.
MAX_REF_RESOLUTION = 512

# Whole-card ceiling, display included. The card has 8 GiB; the rest is headroom for the desktop.
DEVICE_VRAM_LIMIT_GIB = 6.0
# This process, as the kernel accounts it (tensors + HIP context + kernels).
PROCESS_VRAM_LIMIT_GIB = 3.5
# PyTorch allocator cap; the HIP context and fragmentation sit on top of it.
ALLOCATOR_GIB = 2.5
# GPU-mapped system memory (pinned buffers). Nothing is pinned on purpose; this catches regressions.
PROCESS_GTT_LIMIT_GIB = 1.0

LOCK_PATH = Path.home() / ".cache" / "vale-qwen-image.gpu.lock"

TRANSPARENT_PREFIX = "This is an RGBA image with transparency. "
TRANSPARENT_SUFFIX = " The image has alpha channel and the background is transparent."


def process_gpu_bytes():
    """(vram, gtt) bytes held by this process, summed over its distinct amdgpu DRM clients."""
    clients = {}
    for path in glob.glob("/proc/self/fdinfo/*"):
        try:
            text = open(path).read()
        except OSError:
            continue
        if "drm-driver:\tamdgpu" not in text:
            continue
        fields = dict(line.split(":", 1) for line in text.splitlines() if ":" in line)
        client = fields.get("drm-client-id", "").strip()
        vram = int(fields.get("drm-memory-vram", "0 KiB").split()[0]) * 1024
        gtt = int(fields.get("drm-memory-gtt", "0 KiB").split()[0]) * 1024
        if client:
            clients[client] = (vram, gtt)
    return sum(v for v, _ in clients.values()), sum(g for _, g in clients.values())


def device_vram_used_bytes():
    """VRAM in use on the whole card (every process, display included)."""
    for path in glob.glob("/sys/class/drm/card*/device/mem_info_vram_used"):
        return int(open(path).read())
    raise RuntimeError("no amdgpu mem_info_vram_used found; refusing to run without the device-wide guard")


class VramGuard:
    """Takes the single-GPU-job lock, caps the allocator, and kills the process on any limit breach.

    Use VramGuard.get(): the lock is held for the life of the process, so creating a second guard
    in the same process would fail on its own lock.
    """

    _instance = None

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self, interval=0.1):
        LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
        self._lock = open(LOCK_PATH, "w")
        try:
            fcntl.flock(self._lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.exit(f"Another Qwen-Image job holds {LOCK_PATH}; only one may use the GPU at a time.")

        already = device_vram_used_bytes()
        room = (DEVICE_VRAM_LIMIT_GIB - PROCESS_VRAM_LIMIT_GIB) * 2**30
        if already > room:
            sys.exit(
                f"The GPU already has {already / 2**30:.2f} GiB of VRAM in use; starting would risk passing "
                f"{DEVICE_VRAM_LIMIT_GIB} GiB for the card. Close other GPU programs first."
            )

        import torch

        total = torch.cuda.get_device_properties(0).total_memory
        torch.cuda.set_per_process_memory_fraction(ALLOCATOR_GIB * 2**30 / total)
        self.interval = interval
        self.peak = 0
        self.device_peak = 0
        threading.Thread(target=self._watch, daemon=True).start()

    def _watch(self):
        while True:
            vram, gtt = process_gpu_bytes()
            device = device_vram_used_bytes()
            self.peak = max(self.peak, vram)
            self.device_peak = max(self.device_peak, device)
            problem = None
            if vram > PROCESS_VRAM_LIMIT_GIB * 2**30:
                problem = f"process VRAM {vram / 2**30:.2f} GiB > {PROCESS_VRAM_LIMIT_GIB} GiB"
            elif gtt > PROCESS_GTT_LIMIT_GIB * 2**30:
                problem = f"process GTT {gtt / 2**30:.2f} GiB > {PROCESS_GTT_LIMIT_GIB} GiB"
            elif device > DEVICE_VRAM_LIMIT_GIB * 2**30:
                problem = f"card VRAM {device / 2**30:.2f} GiB > {DEVICE_VRAM_LIMIT_GIB} GiB"
            if problem:
                sys.stderr.write(f"\nVRAM GUARD: {problem}; exiting.\n")
                sys.stderr.flush()
                os._exit(3)
            time.sleep(self.interval)


@dataclass
class Job:
    """One image to generate. `refs` are condition images (PIL) for editing."""

    prompt: str
    output: Path
    width: int = 512
    height: int = 512
    seed: int = 0
    refs: list = field(default_factory=list)
    transparent: bool = True

    def ref_resolution(self):
        # Side of the square area each condition image is resized to (the pipeline's
        # `output_resolution`); several references share MAX_REF_RESOLUTION's area.
        budget = MAX_REF_RESOLUTION / max(1, len(self.refs)) ** 0.5
        return int(min((self.width * self.height) ** 0.5, budget)) // 32 * 32

    def full_prompt(self):
        if self.transparent:
            return TRANSPARENT_PREFIX + self.prompt + TRANSPARENT_SUFFIX
        return self.prompt


def _install_chunked_attention(max_score_bytes=128 * 2**20):
    """
    gfx900 has no flash or memory-efficient SDPA kernel, only the math one, which materializes the
    full fp32 score matrix (2 GiB for one 4096-token call). Split the queries so a single call never
    needs more than `max_score_bytes` of scores; results are identical.
    """
    import torch
    import torch.nn.functional as F

    if getattr(F.scaled_dot_product_attention, "_vale_chunked", False):
        return
    original = F.scaled_dot_product_attention

    def chunked(query, key, value, attn_mask=None, dropout_p=0.0, is_causal=False, scale=None, **kwargs):
        heads = query.shape[:-2].numel()
        per_query = heads * key.shape[-2] * 4
        chunk = max(1, max_score_bytes // per_query)
        if is_causal or query.shape[-2] <= chunk:
            return original(query, key, value, attn_mask, dropout_p, is_causal, scale=scale, **kwargs)
        outs = []
        for start in range(0, query.shape[-2], chunk):
            mask = attn_mask
            if mask is not None and mask.dim() >= 2 and mask.shape[-2] == query.shape[-2]:
                mask = mask[..., start : start + chunk, :]
            outs.append(original(query[..., start : start + chunk, :], key, value, mask, dropout_p, scale=scale, **kwargs))
        return torch.cat(outs, dim=-2)

    chunked._vale_chunked = True
    F.scaled_dot_product_attention = chunked


def _free():
    import torch

    gc.collect()
    torch.cuda.empty_cache()


def _offload(module, leaf):
    """
    Stream `module` through the GPU group by group, prefetching on a side stream.

    The CPU copy stays in ordinary pageable memory. Pinning it would roughly triple copy speed
    (3.9 -> 12.9 GB/s) but generation is compute-bound anyway, and 14 GB of page-locked,
    GPU-mapped memory competes with the display.
    """
    import torch
    from diffusers.hooks import apply_group_offloading

    kwargs = dict(
        onload_device=torch.device("cuda"),
        offload_device=torch.device("cpu"),
        use_stream=True,
        low_cpu_mem_usage=True,
    )
    if leaf:
        apply_group_offloading(module, offload_type="leaf_level", **kwargs)
    else:
        apply_group_offloading(module, offload_type="block_level", num_blocks_per_group=1, **kwargs)


def _encode_all(jobs, dtype, log):
    """Stage 1: run the Qwen3-VL text encoder over every job. Returns per-job embeddings on CPU."""
    import torch
    from diffusers import QwenImage21Pipeline
    from transformers import Qwen3VLForConditionalGeneration

    log(f"stage 1: encoding {len(jobs)} prompt(s)")
    text_encoder = Qwen3VLForConditionalGeneration.from_pretrained(
        MODEL_ID, subfolder="text_encoder", dtype=dtype
    )
    text_encoder.eval()
    _offload(text_encoder, leaf=True)
    # Leaf-level offloading only manages modules with parameters; buffer-only modules such as the
    # rotary embeddings would stay on the CPU. They are tiny, so keep them on the GPU.
    for module in text_encoder.modules():
        if not any(True for _ in module.parameters(recurse=False)) and any(True for _ in module.buffers(recurse=False)):
            module.to("cuda")
    pipe = QwenImage21Pipeline.from_pretrained(
        MODEL_ID, transformer=None, vae=None, text_encoder=text_encoder, torch_dtype=dtype
    )

    encoded = []
    for i, job in enumerate(jobs):
        t0 = time.time()
        refs = _prepare_refs(pipe, job) if job.refs else None
        with torch.no_grad():
            emb, mask, pad = pipe.encode_prompt(prompt=job.full_prompt(), image=refs, device=torch.device("cuda"))
        encoded.append(tuple(None if t is None else t.cpu() for t in (emb, mask, pad)))
        del emb, mask, pad
        _free()
        log(f"  [{i + 1}/{len(jobs)}] encoded in {time.time() - t0:.1f}s: {job.output.name}")

    del pipe, text_encoder
    _free()
    return encoded


def _prepare_refs(pipe, job):
    """Resize condition images exactly as QwenImage21Pipeline.__call__ does for the text encoder."""
    from diffusers.pipelines.qwenimage21.pipeline_qwenimage21 import calculate_dimensions

    out = []
    for img in job.refs:
        img = img.convert("RGBA")
        w, h, _ = calculate_dimensions(job.ref_resolution() ** 2, img.size[0] / img.size[1])
        out.append(pipe.image_processor.resize(img, width=w, height=h))
    return out


def _log(msg):
    print(msg, flush=True)


def _step_logger(steps, log, every=5):
    start = time.time()

    def callback(pipe, i, t, kwargs):
        if (i + 1) % every == 0 or i + 1 == steps:
            log(f"      step {i + 1}/{steps}  {(time.time() - start) / (i + 1):.1f}s/step")
        return kwargs

    return callback


def _watch_fp16(transformer, stats):
    """Count blocks whose fp16 output went non-finite (overflow) and track the largest activation."""

    def hook(module, args, output):
        stats["max"] = max(stats["max"], float(output.detach().abs().amax()))
        if not bool(output.isfinite().all()):
            stats["nonfinite"] += 1

    for block in transformer.transformer_blocks:
        block.register_forward_hook(hook)


def run_jobs(jobs, steps=30, log=_log, precision="bf16"):
    """
    Generate every job, saving RGBA PNGs to job.output. Returns peak process VRAM in GiB.

    precision: "bf16" (what the model was trained in) or "fp16". gfx900 has no bf16 hardware, so
    fp16 GEMMs run 1.6-2.7x faster here; each block clips fp16 activations, and any block that still
    overflows is reported.
    """
    import torch
    from diffusers import AutoencoderKLQwenImage21, QwenImage21Pipeline, QwenImage21Transformer2DModel
    from diffusers.models.transformers.transformer_qwenimage21 import QwenImage21AttnProcessor

    guard = VramGuard.get()
    _install_chunked_attention()
    dtype = torch.bfloat16
    compute_dtype = {"bf16": torch.bfloat16, "fp16": torch.float16}[precision]
    encoded = _encode_all(jobs, dtype, log)

    log(f"stage 2: loading transformer ({precision}) + VAE")
    transformer = QwenImage21Transformer2DModel.from_pretrained(
        MODEL_ID, subfolder="transformer", torch_dtype=compute_dtype
    )
    # The default flex-attention processor needs torch.compile (Triton), which gfx900 can't be relied on for;
    # uncompiled it materializes a dense fp32 score matrix. This one is exact and compile-free.
    transformer.set_attn_processor(QwenImage21AttnProcessor())
    fp16_stats = {"max": 0.0, "nonfinite": 0}
    if precision == "fp16":
        _watch_fp16(transformer, fp16_stats)
    _offload(transformer, leaf=False)
    vae = AutoencoderKLQwenImage21.from_pretrained(MODEL_ID, subfolder="vae", torch_dtype=dtype)
    vae.enable_tiling()
    _offload(vae, leaf=True)
    pipe = QwenImage21Pipeline.from_pretrained(
        MODEL_ID, transformer=transformer, vae=vae, text_encoder=None, torch_dtype=dtype
    )
    pipe.set_progress_bar_config(disable=True)

    if compute_dtype != dtype:
        # Condition images are VAE-encoded in the latents' dtype; the VAE stays bf16.
        encode_vae_image = pipe._encode_vae_image
        pipe._encode_vae_image = lambda image, generator: encode_vae_image(image.to(dtype), generator).to(
            compute_dtype
        )

    for i, (job, (emb, mask, pad)) in enumerate(zip(jobs, encoded)):
        t0 = time.time()
        fp16_stats.update(max=0.0, nonfinite=0)
        # The pipeline creates the latents in the embeddings' dtype, so they set the compute precision.
        cached = (emb.to("cuda", compute_dtype), None if mask is None else mask.to("cuda"), pad.to("cuda"))
        # __call__ has no way to take precomputed embeddings for image-conditioned prompts, so hand
        # the stage-1 result back through encode_prompt.
        pipe.encode_prompt = lambda *a, _c=cached, **k: _c
        image = pipe(
            prompt=job.full_prompt(),
            image=job.refs or None,
            width=job.width,
            height=job.height,
            num_inference_steps=steps,
            output_resolution=job.ref_resolution(),
            generator=torch.Generator("cpu").manual_seed(job.seed),
            callback_on_step_end=_step_logger(steps, log),
        ).images[0]
        job.output.parent.mkdir(parents=True, exist_ok=True)
        image.save(job.output)
        extra = ""
        if precision == "fp16":
            extra = f"  fp16 max |act| {fp16_stats['max']:.0f}, non-finite blocks {fp16_stats['nonfinite']}"
        log(
            f"  [{i + 1}/{len(jobs)}] {time.time() - t0:.1f}s  {image.mode} {image.size}  "
            f"peak VRAM process {guard.peak / 2**30:.2f} GiB, card {guard.device_peak / 2**30:.2f} GiB"
            f"{extra}  -> {job.output}"
        )
        _free()

    del pipe, transformer, vae
    _free()
    return guard.peak / 2**30


def run_then_exit(main):
    """
    Run a script's `main` and exit without the libraries' exit-time cleanup. After an
    out-of-memory error, ROCm's HIP runtime has hung in its exit destructor, keeping this
    process's VRAM until it was killed.
    """
    import traceback

    try:
        main()
        code = 0
    except SystemExit as e:
        if isinstance(e.code, str):
            sys.stderr.write(e.code + "\n")
        code = e.code if isinstance(e.code, int) else int(e.code is not None)
    except BaseException:
        traceback.print_exc()
        code = 1
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)


def main():
    parser = argparse.ArgumentParser(description="Generate an image with Qwen-Image-2.1 within strict VRAM limits.")
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", type=int, default=512, help="Square output side (multiple of 32)")
    parser.add_argument("--steps", type=int, default=30)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--ref", action="append", default=[], help="Condition image (repeatable)")
    parser.add_argument("--transparent", action="store_true", help="Request RGBA output with a transparent background")
    parser.add_argument("--precision", choices=["bf16", "fp16"], default="bf16")
    args = parser.parse_args()

    from PIL import Image

    job = Job(
        prompt=args.prompt,
        output=Path(args.output),
        width=args.size,
        height=args.size,
        seed=args.seed,
        refs=[Image.open(r) for r in args.ref],
        transparent=args.transparent,
    )
    peak = run_jobs([job], steps=args.steps, precision=args.precision)
    print(f"done; peak VRAM {peak:.2f} GiB")


if __name__ == "__main__":
    run_then_exit(main)
