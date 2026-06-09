from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="ROBOGO_")

    app_name: str = "RoBoGo Learning Portal"
    environment: str = "local"
    host: str = "127.0.0.1"
    port: int = 3001

    database_provider: str = "postgresql"
    sqlite_path: str = "data/robogo-learning-portal.sqlite3"
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str = "RoBoGoLearningSystemDB"
    db_user: str = "postgres"
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
            return self.postgresql_url(mask_password=True)

        trust_flag = "yes" if self.trust_server_certificate else "no"
        return (
            f"mssql://{self.db_user}:***@{self.db_host}:{self.db_port}/"
            f"{self.db_name}?driver={self.sqlserver_driver.replace(' ', '+')}&"
            f"TrustServerCertificate={trust_flag}"
        )

    @property
    def postgresql_connection_url(self) -> str:
        return self.postgresql_url(mask_password=False)

    def postgresql_url(self, *, mask_password: bool) -> str:
        user = quote_plus(self.db_user)
        password = self.db_password
        if password:
            rendered_password = "***" if mask_password else quote_plus(password)
            auth = f"{user}:{rendered_password}@"
        else:
            auth = f"{user}@"
        return f"postgresql://{auth}{self.db_host}:{self.db_port}/{quote_plus(self.db_name)}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
