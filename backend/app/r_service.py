"""The R service (r_service/, decision 0018). For now the backend only asks whether it answers."""

import httpx


class RService:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.base_url = base_url
        self.transport = transport

    async def reachable(self) -> bool:
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=5.0, transport=self.transport) as client:
                response = await client.get("/health")
            return response.status_code == 200
        except httpx.HTTPError:
            return False
