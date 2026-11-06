"""Shared constants, input models, and safe domain errors."""

from pydantic import BaseModel, Field

APPLICATION = "deployguard-checkout"
GOOD_RELEASE = "v1.0.0"
BAD_RELEASE = "v1.1.0"
ROLLBACK_ACTION = "rollback"
ACTIVE_STATUSES = ("open", "verifying", "verification_failed")


class CheckoutRequest(BaseModel):
    quantity: int = Field(default=1, ge=1, le=100)


class DomainError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 409):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)
