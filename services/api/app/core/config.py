from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str | None = None
    database_url: str | None = None
    supabase_url: str | None = None
    supabase_service_role_key: str | None = None
    supabase_jwt_secret: str | None = None
    vertex_ai_project_id: str | None = None
    vertex_ai_location: str | None = None
    cors_allowed_origins: str | None = None


settings = Settings()
