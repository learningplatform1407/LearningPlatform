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

    # The only setting here with a real default rather than None, deliberately:
    # the question of the day is keyed on a calendar date, and "no timezone"
    # has no sensible meaning for that -- it would make the day boundary
    # depend on wherever the server happens to run. A single institution zone
    # also means every learner gets the same question at the same local
    # midnight, which is what makes two students' calendars comparable.
    # See docs/architecture/daily-question.md.
    institution_timezone: str = "Europe/Bucharest"

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
