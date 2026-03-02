from __future__ import annotations

import polars as pl

from config import settings
from vocabulary.required_concepts import (
    build_concept_relationship_df,
    build_concept_synonym_df,
    build_domain_df,
    build_relationship_df,
    build_vocabulary_df,
    merge_required_concepts,
    required_concept_ids,
)


def build_synthetic_open_package(
    synthetic_concepts: pl.DataFrame,
) -> dict[str, pl.DataFrame]:
    concepts_df = merge_required_concepts(synthetic_concepts)

    package = {
        "concept": concepts_df,
        "vocabulary": build_vocabulary_df(),
        "domain": build_domain_df(),
        "relationship": build_relationship_df(),
        "concept_relationship": build_concept_relationship_df(concepts_df),
        "concept_synonym": build_concept_synonym_df(concepts_df),
        "tenant_concept": concepts_df,
    }

    return package


def load_athena_bundle_placeholder(_: str | None) -> dict[str, pl.DataFrame]:
    raise NotImplementedError(
        "athena_permitted profile is a future placeholder and not part of the default automated pipeline"
    )


def build_vocabulary_package(
    synthetic_concepts: pl.DataFrame,
) -> tuple[dict[str, pl.DataFrame], set[int]]:
    if settings.pipeline_profile == "athena_permitted":
        if not settings.athena_profile_enabled:
            raise RuntimeError(
                "athena_permitted profile requested but athena_profile_enabled=false"
            )
        package = load_athena_bundle_placeholder(settings.vocab_bundle_path)
    else:
        package = build_synthetic_open_package(synthetic_concepts)

    return package, required_concept_ids()
