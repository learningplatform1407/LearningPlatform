from pydantic import BaseModel


class EntitlementResponse(BaseModel):
    feature_key: str
    limit_value: int | None
