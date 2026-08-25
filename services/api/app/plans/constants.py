from dataclasses import dataclass, field
from enum import StrEnum


class PlanCode(StrEnum):
    FREE = "free"
    PRO = "pro"


class BillingInterval(StrEnum):
    MONTH = "month"
    YEAR = "year"


@dataclass(frozen=True)
class PlanMeta:
    name: str
    description: str
    # Filled in once the corresponding Stripe Product/Price objects exist.
    stripe_price_ids: dict[BillingInterval, str] = field(default_factory=dict)


PLANS: dict[str, PlanMeta] = {
    PlanCode.FREE: PlanMeta(name="Free", description="Get started for free."),
    PlanCode.PRO: PlanMeta(name="Pro", description="Unlock the full LearningPlatform experience."),
}

# feature_key -> limit_value (None = unlimited/boolean feature). Empty for
# now — no gated features exist yet. Phase 2+ resource routers add entries
# here as they land.
PLAN_ENTITLEMENTS: dict[str, dict[str, int | None]] = {
    PlanCode.FREE: {},
    PlanCode.PRO: {},
}
