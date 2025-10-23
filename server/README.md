## Fastify Server

### Quick start

```bash
npm i
npm run dev
# Server listens on http://localhost:8787 (or PORT from env)
```

### Environment

Copy the example env and edit as needed:

```bash
cp .env.example .env
```

`.env.example` contains:

```
PORT=8787
OPENAI_API_KEY=sk-...
MODEL_NAME=gpt-4o-mini
```

Notes:
- If `OPENAI_API_KEY` is absent, the server falls back to a mock word-by-word stream.
- `MODEL_NAME` defaults to `gpt-4o-mini` if not set.

### Endpoints

- **GET** `/health` → `{ "ok": true }`
- **POST** `/ask` → `{ jobId }` (body: `{ "question": "..." }`)
- **GET** `/poll?jobId=...&cursor=0` → `{ tokens, nextCursor, done }`

### Examples

```bash
# Create a job
curl -X POST http://localhost:8787/ask \
  -H "content-type: application/json" \
  -d '{"question":"why do I blunder in blitz"}'

# Poll for tokens (replace JOB_ID from previous response)
curl "http://localhost:8787/poll?jobId=JOB_ID&cursor=0"
```

```bash
# Optional: loop until done (requires jq)
JOB_ID=$(curl -sS -X POST http://localhost:8787/ask -H 'content-type: application/json' -d '{"question":"how should I play rook endgames"}' | jq -r .jobId)
CURSOR=0
while true; do
  RES=$(curl -sS "http://localhost:8787/poll?jobId=$JOB_ID&cursor=$CURSOR")
  echo "$RES"
  CURSOR=$(echo "$RES" | jq -r .nextCursor)
  DONE=$(echo "$RES" | jq -r .done)
  [ "$DONE" = "true" ] && break
  sleep 0.3
done
```


