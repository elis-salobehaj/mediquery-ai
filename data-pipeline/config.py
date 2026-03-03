from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    omop_etl_user: str = "omop_user"
    omop_etl_password: str = "omop_password"
    pipeline_db_host: str
    pipeline_db_port: int
    omop_db_name: str = "omop_db"

    pipeline_profile: Literal["synthetic_open", "athena_permitted"] = (
        "synthetic_open"
    )
    athena_profile_enabled: bool = False
    vocab_bundle_path: str | None = None
    fail_on_vocab_gap: bool = True

    synthea_population_size: int = 500
    synthea_seed: int = 42

    omop_tenant_schema: str = "tenant_nexus_health"
    vocab_schema: str = "omop_vocab"

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls,
        init_settings,
        env_settings,
        dotenv_settings,
        file_secret_settings,
    ):
        return (
            init_settings,
            dotenv_settings,
            env_settings,
            file_secret_settings,
        )

    @property
    def database_url(self) -> str:
        return f"postgresql+psycopg://{self.omop_etl_user}:{self.omop_etl_password}@{self.pipeline_db_host}:{self.pipeline_db_port}/{self.omop_db_name}"

    @property
    def active_tenant_schema(self) -> str:
        return self.omop_tenant_schema

    @property
    def tenant_schemas(self) -> list[str]:
        return [self.omop_tenant_schema]

settings = Settings()
