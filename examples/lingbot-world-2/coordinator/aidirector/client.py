"""Shared low-level VLM plumbing — the one place for the model list, image encode,
a single VLM call, and JSON parsing. Standalone (no scene/coordinator deps) so every
tool (director + probe + tests) imports the same helpers instead of copy-pasting.
"""
import base64
import io
import json
import re

from openai import OpenAI
from PIL import Image

NVIDIA_URL = "https://inference-api.nvidia.com/v1"

# Named vision-model shortcuts (pass e.g. --model cosmos). All multimodal + accessible on
# the default-models key. Benchmarked on the 26-probe shark checklist (does it detect the
# fin the small model misreads as a dolphin):
#   cosmos ~4s PASS (8B VL reasoner, fastest+accurate — DEFAULT) | nemotron ~7s FAIL (12B VL)
#   gemini ~3s PASS | minimax ~19s FAIL* (accurate focused) | qwen ~59s PASS (397B, slow)
MODELS = {
    "cosmos": "nvidia/nvidia/cosmos3-nano-reasoner",
    "nemotron": "nvidia/nvidia/nemotron-nano-12b-v2-vl",
    "gemini": "gcp/google/gemini-3.5-flash",
    "minimax": "nvidia/minimaxai/minimax-m2.7",
    "qwen": "nvidia/qwen/qwen3-5-397b-a17b",
}
DEFAULT_MODEL = MODELS["cosmos"]


def resolve_model(name):
    """Expand a shortcut (cosmos) to its full slug; pass a raw slug through unchanged."""
    return MODELS.get(name, name)


def make_client(api_key, base_url=NVIDIA_URL):
    return OpenAI(api_key=api_key, base_url=base_url, max_retries=2, timeout=120)


def encode_image(frame, max_px=768):
    """Downscale (to stay under the request-size limit) + base64 a JPEG. `frame` is a
    PIL Image or an image file path."""
    img = frame if hasattr(frame, "size") else Image.open(frame)
    if img.mode != "RGB":
        img = img.convert("RGB")
    if max(img.size) > max_px:
        s = max_px / max(img.size)
        img = img.resize((int(img.width * s), int(img.height * s)))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


# Disable the reasoner's chain-of-thought for speed. NVIDIA NIM reasoning models
# (cosmos/nemotron family) accept chat_template_kwargs.thinking=False; we also send
# reasoning_effort="low" as a fallback for endpoints that read that. Both go in
# extra_body so unknown fields are ignored rather than erroring the request.
_NO_THINK_BODY = {"chat_template_kwargs": {"thinking": False}, "reasoning_effort": "low"}


def _create(client, model, messages, max_tokens, temperature, think):
    kw = dict(model=model, messages=messages, temperature=temperature, max_tokens=max_tokens)
    if not think:
        kw["extra_body"] = _NO_THINK_BODY
    return client.chat.completions.create(**kw)


def vlm_call(client, model, frame, system, user, max_tokens=512, max_px=768, temperature=0.0, think=True):
    """One image+text VLM call (vision). Returns (reply_text, response). Reasoning is ON by
    default — benchmarked FASTER on cosmos (the thinking:false path is less optimized and was
    consistently slower, esp. at 768). Pass think=False only if a model's no-think path wins."""
    b64 = encode_image(frame, max_px)
    messages = [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            ],
        },
    ]
    resp = _create(client, model, messages, max_tokens, temperature, think)
    text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
    return text, resp


def text_call(client, model, system, user, max_tokens=384, temperature=0.0, think=True):
    """Text-only completion (NO image). The director's decide() reasons purely from
    the shared state/History carried in the system prompt — the probe is the sole
    vision call ('eyes'); decide is the 'brain' over state. `think=False` (default)
    turns OFF the reasoner's chain-of-thought for speed. Returns (reply_text, resp)."""
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    resp = _create(client, model, messages, max_tokens, temperature, think)
    text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
    return text, resp


def parse_json(text):
    """First {...} block, with any <think>…</think> reasoning trace stripped first."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
