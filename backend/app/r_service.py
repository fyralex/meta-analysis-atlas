"""The R service (r_service/, decision 0018): is it up, and run a plan.

The health question times out after 2 s, so /health answers within the backend's container healthcheck (4 s) even
when the R service hangs (#145 audit). A plan gets a minute.
"""

import logging
from typing import Any

import httpx

from .errors import ApiError

logger = logging.getLogger(__name__)

EXECUTE_TIMEOUT = 60.0


class RService:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.base_url = base_url
        self.transport = transport

    async def reachable(self) -> bool:
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=2.0, transport=self.transport) as client:
                response = await client.get("/health")
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    async def execute(self, plan: dict[str, Any], data: dict[str, list[Any]]) -> dict[str, Any]:
        """Run a plan on the data and return the service's `results`.

        An error inside metafor (the service answers 422) is the analysis failing on this data, so it is the
        caller's 422. Anything else is the service or the backend being wrong, so it is a 502 and the details stay
        in the log.
        """
        try:
            async with httpx.AsyncClient(
                base_url=self.base_url, timeout=EXECUTE_TIMEOUT, transport=self.transport
            ) as client:
                response = await client.post("/execute", json={"plan": plan, "data": data})
        except httpx.HTTPError as exc:
            logger.warning("the R service did not answer: %r", exc)
            raise ApiError(502, "r_service_unavailable", "The R service did not answer.") from exc
        try:
            body = response.json()
        except ValueError:
            body = None
        if response.status_code == 200 and isinstance(body, dict) and isinstance(body.get("results"), dict):
            results: dict[str, Any] = body["results"]
            return results
        if response.status_code == 422 and isinstance(body, dict) and isinstance(body.get("error"), str):
            raise ApiError(422, "analysis_failed", f"metafor could not fit this data: {body['error']}")
        logger.error("the R service answered %s: %s", response.status_code, response.text[:500])
        raise ApiError(502, "r_service_error", "The R service returned an answer the backend could not use.")
