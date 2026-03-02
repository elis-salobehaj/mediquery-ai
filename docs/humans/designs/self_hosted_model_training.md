# Mediquery AI: Self-Hosted Model Training & Fine-Tuning Design

> **Document Purpose**: Design for training, fine-tuning, and serving Mediquery's own Text-to-SQL models. This is the **future path** — to be pursued when API-based prompt optimization (see companion doc) hits its accuracy ceiling.
>
> **Last Updated**: February 2026 | **Status**: Roadmap (future work)
>
> **Companion Document**: [Evaluation & Prompt Optimization (API Models)](evaluation_and_finetuning.md) — the current approach using third-party APIs
>
> **Prerequisite**: The [API-based evaluation framework](evaluation_and_finetuning.md) should be operational first. The golden query suite, evaluation runner, and prompt versioning from that design are reused here as the measurement backbone.

---

## 1. When to Pursue This Path

Self-hosted model training becomes worthwhile when:

| Signal                                                                 | What It Means                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| API accuracy plateaus at <90% on golden suite despite prompt iteration | Prompt engineering has diminishing returns — the model needs domain knowledge baked into its weights |
| API costs exceed $X/month and growing with user count                  | Per-query API costs don't amortize; a self-hosted model has fixed infrastructure cost                |
| Latency requirements tighten below what APIs can deliver               | Self-hosted inference can be optimized for your specific workload                                    |
| Data sensitivity concerns from clients                                 | Some Medical clients may require that their queries never leave your infrastructure                  |
| You need a model that understands your specific schema deeply          | Fine-tuning embeds schema knowledge into the model, reducing prompt token overhead                   |

**Until these signals appear, stay with the [API-based approach](evaluation_and_finetuning.md).** It is cheaper, faster to iterate, and requires zero infrastructure beyond what you already have.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    data-pipeline/ project                        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Training Data Collection (Dagster assets)                │  │
│  │                                                           │  │
│  │  Production Logs ──▶ Filter & Dedupe ──▶ JSONL Export     │  │
│  │  Golden Query      ──────────────────▶ Hard Examples      │  │
│  │  Corrections                                              │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                   │
│                    training data (S3)                            │
│                             │                                   │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │  Fine-Tuning Pipeline                                     │  │
│  │                                                           │  │
│  │  Base Model ──▶ LoRA/QLoRA ──▶ Merged Weights ──▶ Export  │  │
│  │  (Mistral/     (4-bit quant)    (safetensors)     (GGUF)  │  │
│  │   CodeLlama)                                              │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                   │
│                    model artifact (S3)                           │
│                             │                                   │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │  Model Registry (MLflow)                                  │  │
│  │                                                           │  │
│  │  version, base model, training data version,              │  │
│  │  golden suite accuracy, latency benchmarks                │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                   │
│                    promoted model                                │
│                             │                                   │
│  ┌──────────────────────────▼────────────────────────────────┐  │
│  │  Inference Server (vLLM / Ollama)                         │  │
│  │                                                           │  │
│  │  OpenAI-compatible API (:8000/v1/chat/completions)        │  │
│  │  Serves the latest promoted model                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                   OpenAI-compatible API
                              │
                ┌─────────────▼──────────────┐
                │  Mediquery App             │
                │  (treats it as just another │
                │   LLM provider — "local")   │
                └────────────────────────────┘
```

**Key principle**: The Mediquery application never knows or cares whether it's talking to Claude via Bedrock or a self-hosted Mistral. The inference server exposes an OpenAI-compatible API, and the app's existing `use_local_model` provider flag routes traffic to it.

---

## 3. Core Components

### 3.1 Training Data Collection

Reuses the golden query infrastructure from the [API-based design](evaluation_and_finetuning.md), plus adds production log harvesting.

**Data sources**:

| Source                               | Volume         | Quality   | Notes                                            |
| ------------------------------------ | -------------- | --------- | ------------------------------------------------ |
| **Golden queries** (curated)         | 50-200         | Highest   | Hand-verified Q→SQL pairs                        |
| **Golden query corrections**         | ~10-50         | Very high | Cases where the agent failed + human-written fix |
| **Production logs** (user-confirmed) | 1,000+/quarter | High      | Queries where user didn't correct the result     |
| **Production logs** (unconfirmed)    | 5,000+/quarter | Medium    | All queries — needs filtering                    |
| **Synthetic augmentation**           | Unlimited      | Variable  | GPT-generated Q→SQL pairs for schema coverage    |

**Output format**: Instruction-tuned JSONL (compatible with all major fine-tuning frameworks):

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a SQL expert. Given the following MySQL database:\n\nTable: patients (id, patient_name, status, mrn_number, ...)\nTable: lab_results (id, patient_id, production_date, oil_vol_bbl, ...)\n\nGenerate a SQL query to answer the user's question."
    },
    { "role": "user", "content": "What was total patient billing last month?" },
    {
      "role": "assistant",
      "content": "SELECT SUM(oil_vol_bbl) FROM lab_results WHERE production_date >= DATE_FORMAT(CURRENT_DATE - INTERVAL 1 MONTH, '%Y-%m-01') AND production_date < DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')"
    }
  ]
}
```

**Dagster schedule**: Weekly export to `s3://mediquery-mlops/training-data/{version}/train.jsonl`

### 3.2 Fine-Tuning Pipeline

**Recommended approach**: Start with **QLoRA** (Quantized Low-Rank Adaptation) — it offers 90% of the accuracy gains of full fine-tuning at a fraction of the GPU cost.

**Base model candidates**:

| Model                 | Size     | Strengths                            | Weaknesses                |
| --------------------- | -------- | ------------------------------------ | ------------------------- |
| **Mistral 7B**        | 7B       | Fast inference, strong reasoning     | Smaller knowledge base    |
| **CodeLlama 13B**     | 13B      | Built for code generation, SQL-aware | Heavier to serve          |
| **DeepSeek Coder V2** | 16B/236B | State-of-art code, MoE efficient     | Large full model          |
| **Qwen 2.5 Coder**    | 7B/32B   | Strong SQL benchmarks, multilingual  | Newer, less battle-tested |

**Training pipeline** (Dagster asset):

```python
@asset(deps=[training_data_export])
def fine_tuned_model(context):
    """Fine-tune base model on curated training data."""
    # 1. Load training data
    train_data = load_jsonl("s3://mediquery-mlops/training-data/v12/train.jsonl")
    eval_data = load_jsonl("s3://mediquery-mlops/training-data/v12/eval.jsonl")

    # 2. Configure QLoRA
    config = LoraConfig(
        r=16, lora_alpha=32, target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05, task_type="CAUSAL_LM"
    )

    # 3. Train (4-bit quantized)
    trainer = SFTTrainer(
        model=base_model, train_dataset=train_data, eval_dataset=eval_data,
        peft_config=config, max_seq_length=2048, num_train_epochs=3
    )
    trainer.train()

    # 4. Merge LoRA weights + export
    merged_model = merge_and_unload(trainer.model)
    merged_model.save("s3://mediquery-mlops/models/mediquery-sql-v12/")

    # 5. Convert to GGUF for Ollama serving (optional)
    convert_to_gguf(merged_model, quantization="Q5_K_M")
```

**GPU requirements**: QLoRA on a 7B model needs ~16GB VRAM (single A100/A10G or 2x T4). Training time: ~2-4 hours for 1,000 examples.

### 3.3 Model Registry

Every model version is tracked with full lineage:

| Field                 | Example                                        |
| --------------------- | ---------------------------------------------- |
| Version               | `mediquery-sql-v12`                            |
| Base model            | `mistral-7b-instruct-v0.2`                     |
| Training data version | `v12` (1,247 examples)                         |
| Training data sources | 200 golden + 47 corrections + 1,000 production |
| Golden suite accuracy | 91.2% (46/50 easy, 38/40 medium, 7/10 hard)    |
| Latency (p50/p95)     | 1.2s / 3.4s                                    |
| Status                | `candidate` → `promoted` → `retired`           |

**Promotion workflow**:

1. New model is trained → registered as `candidate`
2. Golden suite runs against candidate → scores recorded
3. If candidate >= current production model: promote
4. If candidate < current: flag for investigation, keep current
5. Previous production model moves to `retired` (kept for rollback)

### 3.4 Inference Server

Self-hosted model serving with an OpenAI-compatible API — the Mediquery app doesn't need any code changes beyond pointing to a different URL.

**Option A — vLLM** (recommended for production):

```yaml
# docker-compose.yml (pipeline profile)
vllm:
  image: vllm/vllm-openai:latest
  ports:
    - "8000:8000"
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
  command: >
    --model /models/mediquery-sql-v12
    --served-model-name mediquery-sql
    --max-model-len 4096
  volumes:
    - model-store:/models
```

**Option B — Ollama** (recommended for dev/small scale):

```yaml
ollama:
  image: ollama/ollama
  ports:
    - "11434:11434"
  volumes:
    - ollama-models:/root/.ollama
```

**Integration with Mediquery**: The app already has a `use_local_model` flag and `ollama_host` setting. The self-hosted model slots in without application changes:

```python
# backend/config.py — already exists
local_base_model: str = "mediquery-sql:latest"  # ← point to fine-tuned model
ollama_host: str = "http://vllm:8000"            # ← or Ollama URL
```

---

## 4. The Full Training Loop

Once all components are in place, the loop runs with minimal manual intervention:

```
Week 1: Collect production queries (automatic)
         ↓
Week 2: Export training data (Dagster, weekly)
         ↓
Week 3: Fine-tune model (Dagster, triggered by data threshold)
         ↓
         Run golden suite against new model (automatic)
         ↓
         Score improved? ──yes──▶ Promote to production
                         ──no──▶ Investigate, adjust training data
         ↓
Week 4+: Repeat
```

**Human-in-the-loop checkpoints**:

- Golden query curation (domain experts review and add new queries quarterly)
- Model promotion approval (optional — can be automated if golden suite is trusted)
- Training data quality review (spot-check exported pairs)

---

## 5. Cost & Infrastructure Comparison

|                      | API Models (Current)             | Self-Hosted (This Design)               |
| -------------------- | -------------------------------- | --------------------------------------- |
| **Upfront cost**     | $0                               | GPU instance + setup time               |
| **Per-query cost**   | $0.01-0.05 (varies by provider)  | ~$0 marginal (fixed infra cost)         |
| **Break-even**       | —                                | ~50,000 queries/month                   |
| **Latency**          | 2-5s (network + inference)       | 0.5-2s (local inference)                |
| **Accuracy ceiling** | Limited by base model + prompt   | Trainable — accuracy improves with data |
| **Data privacy**     | Queries sent to third-party API  | All data stays on your infrastructure   |
| **Iteration speed**  | Minutes (change prompt, re-eval) | Hours (retrain, re-eval)                |
| **Maintenance**      | Provider manages model updates   | You manage GPU infra, model updates     |

**Recommendation**: Run API models and self-hosted in parallel. Use the golden suite to compare them. Let accuracy and cost data drive the transition — not assumptions.

---

## 6. Success Metrics

| Metric                      | Target                               | Measurement                        |
| --------------------------- | ------------------------------------ | ---------------------------------- |
| **Golden suite accuracy**   | >90% (vs. ~85% with API prompting)   | Eval runner on each model version  |
| **Inference latency (p95)** | <3s                                  | vLLM/Ollama metrics                |
| **Training cycle time**     | <6 hours end-to-end                  | Dagster job duration               |
| **Cost per query**          | <$0.002                              | Infrastructure cost / query volume |
| **Model freshness**         | Retrained within 2 weeks of new data | Dagster schedule adherence         |

---

## 7. Open Questions

1. **Base model selection** — Mistral 7B (fast, cheap) vs. CodeLlama 13B (more capable) vs. Qwen 2.5 Coder 7B (strong SQL)?
2. **Hosting** — Cloud GPU (RunPod, Lambda, AWS g5) vs. on-prem?
3. **Quantization level** — Q4 (fastest, least accurate) vs. Q8 (slower, most accurate) vs. FP16 (full precision)?
4. **Multi-tenant model** — One universal model, or per-tenant fine-tuned variants?
5. **Hybrid routing** — Use self-hosted for easy/medium queries, fall back to API for hard queries?
6. **Retraining trigger** — Time-based (weekly) or data-threshold-based (every 500 new examples)?

---

## 8. Relationship to Other Documents

| Document                                                                      | Relationship                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Evaluation & Prompt Optimization (API Models)](evaluation_and_finetuning.md) | Current approach — must be operational first. Golden suite and eval runner are shared. |
| [Data Pipeline Architecture](schema_per_tenant_rationale.md)                  | Training data comes from tenant databases populated by the pipeline                    |
| [Plan 4: MLOps Foundation](../plans/active/04_mlops_foundation.md)            | Implements the infrastructure (Qdrant, training export, model registry)                |
| [Multi-Agent Architecture](multi_agent_architecture.md)                       | The agent architecture that consumes the model                                         |
