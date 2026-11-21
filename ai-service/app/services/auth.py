"""Credentials for dashboard requests and the gateway anomaly forwarder."""

from secrets import compare_digest

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config.settings import Settings, get_settings

security = HTTPBearer(auto_error=False)


def unauthorized():
    return HTTPException(401, "Invalid or missing bearer credential", headers={"WWW-Authenticate": "Bearer"})


def verify_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> dict:
    if not settings.auth_enabled:
        return {"sub": "dev-user", "role": "owner"}
    if not credentials:
        raise unauthorized()
    try:
        claims = jwt.decode(
            credentials.credentials, settings.jwt_secret_key, algorithms=["HS256"],
            audience="probe-api", issuer="probe-dashboard",
            options={"require_exp": True, "require_sub": True, "require_aud": True},
        )
    except (JWTError, ValueError, TypeError):
        raise unauthorized()
    if claims.get("role") not in ("owner", "manager"):
        raise unauthorized()
    return claims


def verify_gateway(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> None:
    if not settings.auth_enabled:
        return
    if not credentials or not compare_digest(credentials.credentials.encode(), settings.probe_gateway_token.encode()):
        raise unauthorized()
