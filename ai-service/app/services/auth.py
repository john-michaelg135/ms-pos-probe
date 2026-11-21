"""Credentials for dashboard requests and the gateway anomaly forwarder, and each user's branch scope."""

from dataclasses import dataclass
from secrets import compare_digest

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config.settings import Settings, get_settings

security = HTTPBearer(auto_error=False)

API_AUDIENCE = "probe-api"
# Short-lived tickets the browser presents on the live alerts socket; never accepted as API bearers.
ALERTS_WS_AUDIENCE = "probe-alerts-ws"
DEV_CLAIMS = {"sub": "dev-user", "role": "owner"}


def unauthorized():
    return HTTPException(401, "Invalid or missing bearer credential", headers={"WWW-Authenticate": "Bearer"})


def forbidden():
    return HTTPException(403, "This branch is outside your access")


def decode_dashboard_token(token: str, settings: Settings, audience: str = API_AUDIENCE) -> dict:
    """Claims from a token the dashboard signed, or 401."""
    try:
        claims = jwt.decode(
            token, settings.jwt_secret_key, algorithms=["HS256"],
            audience=audience, issuer="probe-dashboard",
            options={"require_exp": True, "require_sub": True, "require_aud": True},
        )
    except (JWTError, ValueError, TypeError):
        raise unauthorized()
    if claims.get("role") not in ("owner", "manager"):
        raise unauthorized()
    return claims


def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> dict:
    if not settings.auth_enabled:
        return dict(DEV_CLAIMS)
    if not credentials:
        raise unauthorized()
    return decode_dashboard_token(credentials.credentials, settings)


def verify_gateway(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> None:
    if not settings.auth_enabled:
        return
    if not credentials or not compare_digest(credentials.credentials.encode(), settings.probe_gateway_token.encode()):
        raise unauthorized()


@dataclass(frozen=True)
class BranchScope:
    """The locations a signed-in user may see: one branch for a manager, every branch for the owner."""

    location_id: int | None = None
    location_name: str | None = None

    @property
    def is_owner(self) -> bool:
        return self.location_id is None

    def allows(self, location_id) -> bool:
        if self.is_owner:
            return True
        try:
            return location_id is not None and int(location_id) == self.location_id
        except (TypeError, ValueError):
            return False

    def sql(self, column: str = "location_id") -> tuple[str, list]:
        """An ` AND ...` condition limiting rows to this scope, with its parameters."""
        return ("", []) if self.is_owner else (f" AND {column} = ?", [self.location_id])

    def check_filter(self, location_id: int | None = None, location_name: str | None = None) -> None:
        """A manager may filter on their own branch (or not at all), never on another one."""
        if self.is_owner:
            return
        if location_id is not None and location_id != self.location_id:
            raise forbidden()
        if location_name not in (None, "", "All") and location_name != self.location_name:
            raise forbidden()


def scope_from_claims(claims: dict) -> BranchScope:
    """Branch scope from verified claims. The location is signed by the dashboard from the POS handoff."""
    if claims.get("role") == "owner":
        return BranchScope()
    location = claims.get("location")
    if claims.get("role") == "manager" and isinstance(location, dict):
        location_id, name = location.get("id"), location.get("name")
        if isinstance(location_id, int) and not isinstance(location_id, bool) and location_id > 0 \
                and isinstance(name, str) and name:
            return BranchScope(location_id, name)
    # A manager without a usable branch sees nothing rather than everything.
    raise forbidden()


def branch_scope(claims: dict = Depends(verify_token)) -> BranchScope:
    return scope_from_claims(claims)
