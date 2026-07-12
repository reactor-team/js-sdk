"""AI Director — LOCAL backend (Qwen2.5-VL-3B via transformers).

Loads the cached Qwen2.5-VL-3B and runs the shared director loop
(director_common.run_director). Shares the GPU with the generator — check
nvidia-smi first. For an NVIDIA-inference backend that needs no local GPU, use
director_nim.py instead.
"""
import argparse
import asyncio

import torch
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration

from director_common import USER_TEXT, load_scene, run_director

MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"


def load_model():
    print(f"[director] loading {MODEL_ID} ...", flush=True)
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        MODEL_ID, torch_dtype=torch.float16, device_map="cuda"
    )
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    print("[director] model ready", flush=True)
    return model, processor


def make_decide(model, processor):
    def decide(frame, system):
        messages = [
            {"role": "system", "content": [{"type": "text", "text": system}]},
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": frame},
                    {"type": "text", "text": USER_TEXT},
                ],
            },
        ]
        text = processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = processor(text=[text], images=[frame], return_tensors="pt").to(
            model.device
        )
        with torch.inference_mode():
            out = model.generate(**inputs, max_new_tokens=384, do_sample=False)
        trimmed = out[:, inputs.input_ids.shape[1] :]
        return processor.batch_decode(trimmed, skip_special_tokens=True)[0]

    return decide


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="ws://localhost:8090", help="coordinator WebSocket")
    ap.add_argument("--frame", default="frame.png", help="latest-frame image file to watch")
    ap.add_argument("--scene", default="", help="scene JSON (for base identity + event list)")
    ap.add_argument("--interval", type=float, default=3.0, help="seconds between frame checks")
    ap.add_argument("--once", action="store_true", help="run one proposal and exit (test)")
    args = ap.parse_args()

    model, processor = load_model()
    decide = make_decide(model, processor)
    scene = load_scene(args.scene)
    asyncio.run(
        run_director(decide, args.url, args.frame, scene, args.interval, args.once)
    )


if __name__ == "__main__":
    main()
