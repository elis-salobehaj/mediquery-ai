import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    pipeline_db_user: str
    pipeline_db_password: str
    pipeline_db_host: str
    pipeline_db_port: int
    pipeline_db_name: str
    
    tenant_schemas: list[str] = ["tenant_nexus_health"]
    vocab_schema: str = "omop_vocab"

    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def database_url(self) -> str:
        return f"postgresql+psycopg://{self.pipeline_db_user}:{self.pipeline_db_password}@{self.pipeline_db_host}:{self.pipeline_db_port}/{self.pipeline_db_name}"

settings = Settings()
