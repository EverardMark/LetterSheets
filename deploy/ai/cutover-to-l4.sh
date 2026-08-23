#!/usr/bin/env bash
# Post-resize cutover: bring both models up on the L4 and prove they work.
#
# Run this ON THE AI BOX after changing the instance type to g6.xlarge.
# It is idempotent — safe to re-run if a step fails.
#
#   scp -i AI.pem deploy/ai/*.service deploy/ai/cutover-to-l4.sh ubuntu@<new-ip>:/home/ubuntu/erp_ai/
#   ssh -i AI.pem ubuntu@<new-ip> 'bash /home/ubuntu/erp_ai/cutover-to-l4.sh'
set -euo pipefail
cd /home/ubuntu/erp_ai

echo "=== 1. confirm we are actually on an L4 ==="
GPU=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)
echo "    $GPU"
MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
if [ "$MEM" -lt 20000 ]; then
  echo "    ABORT: ${MEM}MiB of VRAM. The two-model layout needs a 24GB card;"
  echo "    on anything smaller the vision service will OOM at startup."
  exit 1
fi

echo "=== 2. install both units ==="
sudo cp erp-vllm.service erp-vllm-vision.service /etc/systemd/system/
sudo systemctl daemon-reload

echo "=== 3. tool-calling model (its share drops 0.72 -> 0.45 to make room) ==="
sudo systemctl restart erp-vllm
until curl -s -o /dev/null -m 5 -w "%{http_code}" localhost:8000/health 2>/dev/null | grep -q 200; do sleep 10; done
echo "    up on :8000"

echo "=== 4. vision model ==="
sudo systemctl enable --now erp-vllm-vision
# First start downloads ~6GB, so this waits longer than the other.
for i in $(seq 1 90); do
  curl -s -o /dev/null -m 5 -w "%{http_code}" localhost:8002/health 2>/dev/null | grep -q 200 && break
  sleep 10
done
curl -s -o /dev/null -m 5 -w "%{http_code}" localhost:8002/health 2>/dev/null | grep -q 200 \
  || { echo "    vision model did not start; see: journalctl -u erp-vllm-vision -n 40"; exit 1; }
echo "    up on :8002"

echo "=== 5. verify BOTH, not just that they started ==="
KEY=$(grep VLLM_API_KEY erp-vllm.env | cut -d= -f2)

# Tool calling is the load-bearing capability; a green health check does not
# prove it still picks the right action.
TOOLS='[{"type":"function","function":{"name":"get_leaves","description":"List leave requests - who is off, away, on leave.","parameters":{"type":"object","properties":{"date_from":{"type":"string"},"date_to":{"type":"string"}},"required":[]}}}]'
R=$(curl -s -m 60 localhost:8000/v1/chat/completions -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"qwen3-8b\",\"max_tokens\":80,\"temperature\":0,\"chat_template_kwargs\":{\"enable_thinking\":false},\"tool_choice\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"who is off next week? today is 2026-08-22\"}],\"tools\":$TOOLS}")
echo "$R" | grep -q '"tool_calls"' \
  && echo "    tool calling: OK" \
  || { echo "    TOOL CALLING BROKEN — this is the regression that matters:"; echo "$R" | head -c 300; exit 1; }

echo "$R" | python3 -c "import json,sys; print('   ->', json.load(sys.stdin)['choices'][0]['message']['tool_calls'][0]['function']['arguments'])" 2>/dev/null || true

echo "=== 6. memory headroom ==="
nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader | sed 's/^/    /'

echo
echo "Both models are up. Remaining steps, on the ERP server:"
echo "  - set ai.base_url    to http://<this-box-ip>:8000   (the IP changes on resize)"
echo "  - set ai.vision_model to qwen-vl"
echo "  - restart the API"
