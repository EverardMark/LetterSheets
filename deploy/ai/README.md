# ERP assistant — inference host

The model behind the prompt layer. One vLLM process serving a shared base model
plus a LoRA adapter per company.

## The host

`18.140.1.163` (AWS ap-southeast-1), Ubuntu 24.04, **Tesla T4 (15 GB)**, 4 vCPU,
15 GB RAM.

> **This box is shared.** `pixelmine-serve.service` is a live, unrelated RAG API
> on the same machine and the same GPU, holding port **8000** and ~0.8 GB of
> VRAM. The ERP deployment lives entirely in `/home/ubuntu/erp_ai`, listens on
> **8001**, and caps its GPU pool so it cannot starve that service. Do not raise
> `--gpu-memory-utilization` without checking what else is resident.

## What the T4 forces

Compute capability 7.5 (Turing) is the constraint that shapes every choice here:

| Constraint | Consequence |
|---|---|
| No bfloat16 | `--dtype float16` is mandatory. On `auto`, vLLM reads bf16 from the model config and fails at load. |
| No FlashAttention-2 (needs Ampere) | vLLM falls back to a slower attention backend. Nothing to configure; just expect less throughput than a benchmark on an A10 or L4. |
| No Marlin AWQ kernel (needs Ampere) | AWQ still works via the older kernel, slower than headline AWQ numbers. |
| 15 GB VRAM, ~14 GB free | **FP16 is off the table at any useful size** — Qwen3-8B is ~16 GB and Qwen3-14B ~28 GB. Quantised weights are not an optimisation here, they are the only way the model fits. |

**Model: `Qwen/Qwen3-8B-AWQ`** — ~5.5 GB of weights, leaving real room for KV
cache and adapters. A 14B AWQ would fit at ~9 GB but leaves almost nothing for
either, and is meaningfully slower on this card.

**Expect roughly 5–10 seconds per turn**, dominated by prefill of the system
prompt plus twelve tool schemas. That is usable for a prompt box; it is not
instant. If it needs to be faster the answer is a better GPU (L4/A10), not a
smaller model — dropping below 8B costs tool-calling reliability, which is the
one thing this model exists to do well.

## Layout

```
/home/ubuntu/erp_ai/
├── .venv/           vLLM and its dependencies
├── models/          HF_HOME — model cache lives here, not in ~/.cache
├── adapters/        per-company LoRA adapters
├── api-key          the bearer token vLLM requires (mode 0600)
└── logs/
```

## Deploy

```bash
sudo cp erp-vllm.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now erp-vllm
journalctl -u erp-vllm -f          # first start downloads ~5.5GB
```

Verify:

```bash
curl -s localhost:8001/v1/models -H "Authorization: Bearer $(cat ~/erp_ai/api-key)" | jq
```

## Exposure — deliberately not done yet

vLLM binds **127.0.0.1** only. Nothing off-box can reach it, including the ERP
API server, which is a separate host.

That is the safe default, not the finished state. An inference endpoint on a
public IP is an open invitation to run arbitrary generation on someone else's
GPU bill, and an API key alone on the open internet is thin. Pick one before
connecting the ERP:

1. **SSH tunnel or Tailscale** (preferred) — no public port at all. The ERP
   server reaches `http://127.0.0.1:8001` through the tunnel and `ai.base_url`
   never changes.
2. **Security group pinned to the ERP server's IP**, plus the API key, plus
   `--host 0.0.0.0`. Acceptable, but the group is now load-bearing security.

Do not simply flip `--host` to `0.0.0.0` and stop there.

## Wiring the ERP to it

In the API server's `config.json`:

```json
"ai": {
  "enabled": true,
  "base_url": "http://127.0.0.1:8001",
  "base_model": "qwen3-8b",
  "api_key": "<contents of erp_ai/api-key>",
  "vision_model": "",
  "timeout_seconds": 180
}
```

`base_model` must match `--served-model-name`. Companies with no adapter are
served by it; those with an active row in `ai_company_adapters` are served by
theirs. `vision_model` stays empty until a VL model is deployed — a T4 with a
resident 8B has no room for a second model, so document scanning needs either a
bigger card or its own host.

## Adding a company's adapter

1. Export that company's training data (`ExportExamples`, tenant-scoped).
2. Train a LoRA at rank ≤ 32 — the ceiling `--max-lora-rank` was started with.
   Raising it later requires a restart.
3. Drop the adapter in `/home/ubuntu/erp_ai/adapters/<company>/`.
4. Register it **inactive**, confirm it behaves, then activate:

```sql
INSERT INTO ai_company_adapters (company_id, adapter, active, trained_on, trained_at)
VALUES ('<uuid>', '<adapter-name>', 0, 2400, NOW());
```

`--max-loras 4` is the GPU-resident limit; `--max-cpu-loras 32` holds the rest in
host RAM and pages them in. Tenant count is bounded by RAM, not VRAM.

## Teardown

```bash
sudo systemctl disable --now erp-vllm
sudo rm /etc/systemd/system/erp-vllm.service && sudo systemctl daemon-reload
rm -rf /home/ubuntu/erp_ai
```

Nothing outside that directory is touched, and `pixelmine` is unaffected.
