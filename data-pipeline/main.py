from config import settings
from load_omop import main as run_omop_etl


def validate_profile_settings() -> None:
    if settings.pipeline_profile == "athena_permitted" and not settings.athena_profile_enabled:
        raise RuntimeError(
            "PIPELINE_PROFILE=athena_permitted requires ATHENA_PROFILE_ENABLED=true; "
            "athena profile is a placeholder and disabled by default"
        )


def main() -> None:
    print(
        "Running data pipeline with "
        f"profile={settings.pipeline_profile}, "
        f"tenant_schema={settings.active_tenant_schema}, "
        f"vocab_schema={settings.vocab_schema}, "
        f"fail_on_vocab_gap={settings.fail_on_vocab_gap}"
    )
    validate_profile_settings()
    run_omop_etl()


if __name__ == "__main__":
    main()
