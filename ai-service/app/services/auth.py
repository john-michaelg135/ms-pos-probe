"""
US-PROBE-003: JWT authentication service.
Validates Bearer tokens signed by the legacy auth service using HMAC-SHA256.

DEV MODE: When AUTH_ENABLED=false in .env, all endpoints are accessible
without a token. Set AUTH_ENABLED=true for production/defense.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Request
from jose import JWTError, jwt

from app.config.settings import Settings, get_settings

security = HTTPBearer(auto_error=False)


def verify_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Extracts and validates the JWT Bearer token.
    Returns the decoded payload if valid.

    In dev mode (auth_enabled=false), returns a mock payload without requiring a token.
    """
    # Dev mode bypass
    if not settings.auth_enabled:
        return {
            "sub": "dev-user",
            "email": "dev@pos-probe.local",
            "role": "Admin",
        }

    # Production mode: require valid token
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
