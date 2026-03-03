# Changelog

## [2.0.0](https://github.com/elis-salobehaj/mediqueryAI/compare/mediquery-ai-v1.4.0...mediquery-ai-v2.0.0) (2026-01-25)

### ⚠ BREAKING CHANGES

* **Complete architectural overhaul**: Migrated from a single-agent LangGraph workflow to a sophisticated multi-agent system with specialized agents (Navigator, Writer, Critic).
* **API Response Format Update**: The `/query` endpoint now returns detailed agent thoughts and metadata in the `meta` field.
* **Frontend Theme System**: Complete redesign of the UI with dynamic CSS variables and 3 premium themes (Light, Dark, Clinical Slate).

### Multi-Agent SQL Architecture (LangGraph)

* **Schema Navigator Agent**: Intelligently selects relevant database tables for complex queries.
* **SQL Writer Agent**: Generates optimized SQL queries based on identified schema.
* **Critic Agent**: Validates generated SQL and provides feedback for self-correction.
* **Reflexion Loop**: Implemented a self-correcting mechanism with up to 2 retry attempts.
* **Hybrid Mode**: Graceful fallback to single-agent mode ensures high availability.

### AWS Bedrock & Model Integration

* **Production-ready Claude 3.5 Sonnet**: Integrated as the primary model for complex reasoning.
* **Bearer Token Auth**: Secure AWS credential management for Bedrock API access.
* **Optimized Model Selection**: Intelligent routing to different models based on task complexity.

### Frontend UI/UX Overhaul

* **Premium Theme Suite**: Introduced "Light", "Dark", and "Clinical Slate" with a glassmorphism design.
* **Theme-Aware Architecture**: Replaced all hardcoded colors with a centralized CSS variable system.
* **Enhanced Thread Management**: Full CRUD operations for chat threads including pinning and list management.

### Infrastructure & CI/CD Optimization

* **Testing Reliability**: Standardized on Pytest with categorized markers (unit, integration).
* **Hermetic Environments**: Docker-based test orchestration for consistent CI runs.
* **Pipeline Speed**: Optimized GitHub Actions with better caching and parallelization.

### Features

* complete auth system, sci-fi UI, and ci pipeline ([c3aebb3](https://github.com/elis-salobehaj/mediqueryAI/commit/c3aebb3ce6f397b2058022c6fa2ab81c8680f40e))
* enable nvidia gpu support in docker compose ([f77998c](https://github.com/elis-salobehaj/mediqueryAI/commit/f77998c75c6bf691576929635acca0a5918b2918))
* Enhanced SQL Agent, Visualization Fixes & Optimized CI/CD ([#6](https://github.com/elis-salobehaj/mediqueryAI/issues/6)) ([dd7aab6](https://github.com/elis-salobehaj/mediqueryAI/commit/dd7aab63dffc038fe6eba3d618b87104ca4af0b8))
* Explainable AI and Visualization Enhancements ([#4](https://github.com/elis-salobehaj/mediqueryAI/issues/4)) ([9a54e3d](https://github.com/elis-salobehaj/mediqueryAI/commit/9a54e3db6f2733e088b8ba64b0318dcc1782e15b))
* integrate qwen2.5-coder and sqlcoder models ([#2](https://github.com/elis-salobehaj/mediqueryAI/issues/2)) ([458a883](https://github.com/elis-salobehaj/mediqueryAI/commit/458a883bd251b71ca74ce8016e7ccaab1f9f4335))
* migrate to playwright and enable dynamic model config ([7f54790](https://github.com/elis-salobehaj/mediqueryAI/commit/7f54790365720dac11b9ddad730da4f387f0b987))
* trigger release for accumulated optimizations and fixes ([#10](https://github.com/elis-salobehaj/mediqueryAI/issues/10)) ([757fadd](https://github.com/elis-salobehaj/mediqueryAI/commit/757fadd632fae2b0de3b8c6902e4239d009c63af))
* trigger v2.0.0 release with breaking changes ([50ea6fb](https://github.com/elis-salobehaj/mediqueryAI/commit/50ea6fbbe9b98d477035700b87133a20dd0ae17d))

### Bug Fixes

* correct python version step name in ci ([31866ad](https://github.com/elis-salobehaj/mediqueryAI/commit/31866ad5f9e50c77b3550c032b5807a17317b8d2))
* stabilize ci pipeline by correcting test data and removing flaky e2e script ([a601f87](https://github.com/elis-salobehaj/mediqueryAI/commit/a601f87ec2f3d482e0df82c89c812d2a0778a3f1))
* use python -m pytest in CI to resolve import paths ([3e5b12b](https://github.com/elis-salobehaj/mediqueryAI/commit/3e5b12b3d8ee73f16699f66f66f249040f93d8ea))

## [1.4.0](https://github.com/elis-salobehaj/mediqueryAI/compare/mediquery-ai-v1.3.0...mediquery-ai-v1.4.0) (2026-01-16)


### Features

* trigger release for accumulated optimizations and fixes ([#10](https://github.com/elis-salobehaj/mediqueryAI/issues/10)) ([cb247fe](https://github.com/elis-salobehaj/mediqueryAI/commit/cb247feed6236f4a86936def327446ddc2140cf5))

## [1.3.0](https://github.com/elis-salobehaj/mediqueryAI/compare/mediquery-ai-v1.2.0...mediquery-ai-v1.3.0) (2025-12-25)


### Features

* Enhanced SQL Agent, Visualization Fixes & Optimized CI/CD ([#6](https://github.com/elis-salobehaj/mediqueryAI/issues/6)) ([d9150f0](https://github.com/elis-salobehaj/mediqueryAI/commit/d9150f00cab9123c943dee50c2151be85247a809))

## [1.2.0](https://github.com/elis-salobehaj/mediqueryAI/compare/mediquery-ai-v1.1.0...mediquery-ai-v1.2.0) (2025-12-25)


### Features

* Explainable AI and Visualization Enhancements ([#4](https://github.com/elis-salobehaj/mediqueryAI/issues/4)) ([df58412](https://github.com/elis-salobehaj/mediqueryAI/commit/df5841231a537dc70ac62a2d3e3f5f36ec381d6c))

## [1.1.0](https://github.com/elis-salobehaj/mediqueryAI/compare/mediquery-ai-v1.0.0...mediquery-ai-v1.1.0) (2025-12-25)


### Features

* integrate qwen2.5-coder and sqlcoder models ([#2](https://github.com/elis-salobehaj/mediqueryAI/issues/2)) ([afceb20](https://github.com/elis-salobehaj/mediqueryAI/commit/afceb2017d43252d18c9be61ed8456f000972b11))

## 1.0.0 (2025-12-23)


### Features

* complete auth system, sci-fi UI, and ci pipeline ([6513596](https://github.com/elis-salobehaj/mediqueryAI/commit/65135968851c413e27fbdb57a2fbd8872d2656b8))
* enable nvidia gpu support in docker compose ([9f6d38a](https://github.com/elis-salobehaj/mediqueryAI/commit/9f6d38ad710a63e47c5eb309d0885419afd5f9ba))
* migrate to playwright and enable dynamic model config ([ed5a288](https://github.com/elis-salobehaj/mediqueryAI/commit/ed5a288891d71262cffcb81ae9e25e7a147f2b77))


### Bug Fixes

* correct python version step name in ci ([f33b348](https://github.com/elis-salobehaj/mediqueryAI/commit/f33b3486577a50388ee85ed85d22984be189a821))
* stabilize ci pipeline by correcting test data and removing flaky e2e script ([098b775](https://github.com/elis-salobehaj/mediqueryAI/commit/098b7756f02e8c7dfacef0615cef718f62452f41))
* use python -m pytest in CI to resolve import paths ([4829bf0](https://github.com/elis-salobehaj/mediqueryAI/commit/4829bf0be1168980fb4535d9b0804016da6067f4))
