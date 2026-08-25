from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str | None = None
    database_url: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    vertex_ai_project_id: str | None = None
    vertex_ai_location: str | None = None
    cors_allowed_origins: str | None = None

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str | None) -> str | None:
        # Supabase's dashboard gives a plain postgresql:// URL, which
        # SQLAlchemy defaults to the psycopg2 driver. We install psycopg
        # (v3) instead, so normalize the scheme to request it explicitly.
        if value is None:
            return value
        if value.startswith("postgres://"):
            value = "postgresql://" + value.removeprefix("postgres://")
        if value.startswith("postgresql://"):
            value = "postgresql+psycopg://" + value.removeprefix("postgresql://")
        return value


settings = Settings()
