"""Composition root: wires adapters to ports based on ``Settings``.

Lambda handlers build the container once per execution environment (cold
start) and reuse it across invocations.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from aws_lambda_powertools.utilities.idempotency import BasePersistenceLayer

from fleetintel.adapters.memory import (
    InMemoryCache,
    InMemoryIncidentRepository,
    InMemoryQueue,
    InMemoryStateStore,
)
from fleetintel.config import Backend, EnrichmentMode, LLMProvider, Settings
from fleetintel.detection import DetectorConfig
from fleetintel.diagnosis.llm import (
    FakeDiagnosisModel,
    OpenAICompatibleChat,
    OpenAICompatibleEmbeddings,
)
from fleetintel.diagnosis.rag import HashingEmbeddings, RunbookIndex
from fleetintel.diagnosis.service import DiagnosisService
from fleetintel.enrichment.providers import (
    FixtureStatusFeed,
    FixtureWeather,
    HashedCellTowers,
    OpenCelliDTowers,
    OpenMeteoWeather,
    StaticCarrierRegistry,
    StatuspageFeed,
)
from fleetintel.enrichment.service import EnrichmentService
from fleetintel.ports import (
    Cache,
    CellTowerProvider,
    DetectorStateStore,
    EmbeddingProvider,
    IncidentRepository,
    JobQueue,
    LLMClient,
    StatusFeedProvider,
    WeatherProvider,
)
from fleetintel.resilience import CircuitBreaker, ResilientCaller, RetryPolicy


@dataclass
class Container:
    settings: Settings
    repo: IncidentRepository
    state_store: DetectorStateStore
    enrichment_queue: JobQueue
    diagnosis_queue: JobQueue
    quarantine_queue: JobQueue
    enrichment: EnrichmentService
    diagnosis: DiagnosisService
    detector_config: DetectorConfig
    idempotency_store: BasePersistenceLayer


def _boto(service: str, settings: Settings) -> Any:
    import boto3

    return boto3.client(service, endpoint_url=settings.aws_endpoint_url)  # type: ignore[call-overload]


def _llm(settings: Settings) -> tuple[LLMClient, EmbeddingProvider]:
    if settings.llm_provider is not LLMProvider.OPENAI_COMPATIBLE:
        return FakeDiagnosisModel(), HashingEmbeddings()
    llm_http = httpx.Client(timeout=httpx.Timeout(settings.llm_timeout_seconds))
    key = settings.llm_api_key.get_secret_value()
    if settings.llm_api_key_secret_arn:
        from aws_lambda_powertools.utilities import parameters

        key = str(parameters.get_secret(settings.llm_api_key_secret_arn, max_age=300))
    llm = OpenAICompatibleChat(
        llm_http,
        settings.llm_base_url,
        key,
        settings.llm_model,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_output_tokens,
    )
    embedder = OpenAICompatibleEmbeddings(
        llm_http, settings.llm_base_url, key, settings.llm_embedding_model
    )
    return llm, embedder


def build_container(settings: Settings) -> Container:
    http = httpx.Client(
        timeout=httpx.Timeout(settings.http_timeout_seconds), follow_redirects=False
    )

    repo: IncidentRepository
    state: DetectorStateStore
    cache: Cache
    enrich_q: JobQueue
    diag_q: JobQueue
    quarantine_q: JobQueue
    idempotency: BasePersistenceLayer
    if settings.backend is Backend.AWS:
        from aws_lambda_powertools.utilities.idempotency import DynamoDBPersistenceLayer

        from fleetintel.adapters.dynamodb import (
            DynamoCache,
            DynamoIncidentRepository,
            DynamoStateStore,
        )
        from fleetintel.adapters.sqs import NullQueue, SqsJobQueue

        ddb = _boto("dynamodb", settings)
        sqs = _boto("sqs", settings)
        repo = DynamoIncidentRepository(ddb, settings.table_name)
        state = DynamoStateStore(ddb, settings.table_name)
        cache = DynamoCache(ddb, settings.table_name)
        enrich_q = SqsJobQueue(sqs, settings.enrichment_queue_url)
        diag_q = SqsJobQueue(sqs, settings.diagnosis_queue_url)
        quarantine_q = (
            SqsJobQueue(sqs, settings.quarantine_queue_url)
            if settings.quarantine_queue_url
            else NullQueue()
        )
        idempotency = DynamoDBPersistenceLayer(
            table_name=settings.table_name,
            key_attr="PK",
            sort_key_attr="SK",
            expiry_attr="ttl",
            boto3_client=ddb,
        )
    else:
        from fleetintel.adapters.idempotency import InMemoryPersistenceLayer

        repo = InMemoryIncidentRepository()
        state = InMemoryStateStore()
        cache = InMemoryCache()
        enrich_q, diag_q, quarantine_q = InMemoryQueue(), InMemoryQueue(), InMemoryQueue()
        idempotency = InMemoryPersistenceLayer()

    towers: CellTowerProvider
    weather: WeatherProvider
    status: StatusFeedProvider
    if settings.enrichment_mode is EnrichmentMode.LIVE:
        towers = OpenCelliDTowers(
            http, settings.opencellid_url, settings.opencellid_api_key.get_secret_value()
        )
        weather = OpenMeteoWeather(http, settings.open_meteo_url)
        status = StatuspageFeed(http, settings.status_feed_url)
    else:
        towers, weather, status = HashedCellTowers(), FixtureWeather(), FixtureStatusFeed()

    def caller(name: str) -> ResilientCaller:
        return ResilientCaller(
            breaker=CircuitBreaker(
                name, settings.breaker_failure_threshold, settings.breaker_reset_seconds
            ),
            retry=RetryPolicy(attempts=settings.http_retries + 1),
            cache=cache,
            ttl_seconds=settings.cache_ttl_seconds,
        )

    enrichment = EnrichmentService(
        towers=towers,
        weather=weather,
        carrier=StaticCarrierRegistry(),
        status_feed=status,
        callers={n: caller(n) for n in ("celltower", "weather", "carrier", "status_feed")},
    )

    llm, embedder = _llm(settings)
    diagnosis = DiagnosisService(
        llm=llm,
        index=RunbookIndex(embedder),
        top_k=settings.rag_top_k,
        min_confidence=settings.min_confidence,
        temperature=settings.llm_temperature,
        max_output_tokens=settings.llm_max_output_tokens,
    )
    return Container(
        settings=settings,
        repo=repo,
        state_store=state,
        enrichment_queue=enrich_q,
        diagnosis_queue=diag_q,
        quarantine_queue=quarantine_q,
        enrichment=enrichment,
        diagnosis=diagnosis,
        detector_config=DetectorConfig(
            window_seconds=settings.window_seconds,
            allowed_lateness_seconds=settings.allowed_lateness_seconds,
            z_threshold=settings.z_threshold,
            ewma_alpha=settings.ewma_alpha,
            min_samples=settings.min_samples,
            episode_gap_windows=settings.episode_gap_windows,
        ),
        idempotency_store=idempotency,
    )


_container: Container | None = None


def get_container() -> Container:
    global _container  # noqa: PLW0603 - one container per Lambda execution environment
    if _container is None:
        from fleetintel.config import get_settings

        _container = build_container(get_settings())
    return _container


def set_container(container: Container | None) -> None:
    """Test/local hook to inject a pre-built container."""
    global _container  # noqa: PLW0603
    _container = container
