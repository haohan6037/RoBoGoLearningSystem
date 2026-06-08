from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="ROBOGO_")

    app_name: str = "RoBoGo Learning Portal"
    environment: str = "local"
    host: str = "127.0.0.1"
    port: int = 3001

    database_provider: str = "sqlite"
    sqlite_path: str = "data/robogo-learning-portal.sqlite3"
    db_host: str = "127.0.0.1"
    db_port: int = 1433
    db_name: str = "RoBoGoLearningSystemDB"
    db_user: str = "sa"
    db_password: str = Field(default="", repr=False)
    sqlserver_driver: str = "ODBC Driver 18 for SQL Server"
    trust_server_certificate: bool = True

    @property
    def is_database_password_configured(self) -> bool:
        return bool(self.db_password.strip())

    @property
    def sqlite_file(self) -> Path:
        return Path(self.sqlite_path)

    @property
    def database_url(self) -> str:
        if self.database_provider.lower() == "sqlite":
            return f"sqlite:///{self.sqlite_file}"

        if self.database_provider.lower() == "postgresql":
            return (
                f"postgresql://{self.db_user}:{self.db_password}@"
                f"{self.db_host}:{self.db_port}/{self.db_name}"
            )

        trust_flag = "yes" if self.trust_server_certificate else "no"
        return (
            f"mssql://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/"
            f"{self.db_name}?driver={self.sqlserver_driver.replace(' ', '+')}&"
            f"TrustServerCertificate={trust_flag}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
