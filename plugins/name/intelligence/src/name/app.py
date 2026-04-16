"""FastAPI application factory."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse


@asynccontextmanager
async def _lifespan(app: FastAPI):
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Name", version="0.1.0", lifespan=_lifespan)

    @app.get("/health")
    async def health():
        return JSONResponse({"status": "healthy", "version": "0.1.0"})

    return app
