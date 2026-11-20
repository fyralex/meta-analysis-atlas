"""Errors are JSON with a stable code, a message and, where they apply, field paths (CLAUDE.md, "API")."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class FieldError(BaseModel):
    path: str
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    fields: list[FieldError] = []
    # extra facts a client can read, such as a pathway's status and milestone
    details: dict[str, Any] = {}


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        fields: list[FieldError] | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.body = ErrorBody(code=code, message=message, fields=fields or [], details=details or {})


def _response(status: int, body: ErrorBody) -> JSONResponse:
    return JSONResponse(status_code=status, content=body.model_dump())


def _path(loc: tuple[Any, ...] | list[Any]) -> str:
    return ".".join(str(part) for part in loc)


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _response(exc.status, exc.body)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [FieldError(path=_path(e["loc"]), message=str(e["msg"])) for e in exc.errors()]
        return _response(422, ErrorBody(code="invalid_request", message="The request is not valid.", fields=fields))

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return _response(exc.status_code, ErrorBody(code=code, message=str(exc.detail)))

    @app.exception_handler(Exception)
    async def internal_error(_: Request, exc: Exception) -> JSONResponse:
        # the details stay in the server's log, not in the response
        logger.exception("unhandled error", exc_info=exc)
        return _response(500, ErrorBody(code="internal_error", message="Something went wrong on the server."))
