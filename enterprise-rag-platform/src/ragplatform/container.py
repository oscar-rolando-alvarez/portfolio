"""Composition root: the only place that knows which adapter implements which port."""

from __future__ import annotations

from dataclasses import dataclass, field

from ragplatform.adapters.llm.fake import ExtractiveFakeLLM, HashingEmbeddingProvider
from ragplatform.adapters.llm.openai_compatible import (
    OpenAICompatibleChat,
    OpenAICompatibleEmbeddings,
)
from ragplatform.adapters.memory.store import InMemoryStore
from ragplatform.config import ProviderKind, RerankerKind, RewriterKind, Settings
from ragplatform.domain.ports import (
    ApiKeyStore,
    DocumentStore,
    EmbeddingProvider,
    HealthCheck,
    JobQueue,
    LLMProvider,
    QueryRewriter,
    Reranker,
    SearchIndex,
    SemanticCache,
    UsageLedger,
)
from ragplatform.generation.service import AnswerService
from ragplatform.ingestion.service import IngestionService
from ragplatform.observability.cost import CostMeter
from ragplatform.retrieval.rerankers import (
    HttpCrossEncoderReranker,
    LexicalReranker,
    LLMReranker,
    NoopReranker,
)
from ragplatform.retrieval.rewriters import HeuristicQueryRewriter, LLMQueryRewriter
from ragplatform.retrieval.service import RetrievalService
from ragplatform.worker.runner import IngestionWorker


@dataclass
class Container:
    settings: Settings
    documents: DocumentStore
    index: SearchIndex
    queue: JobQueue
    cache: SemanticCache
    ledger: UsageLedger
    api_keys: ApiKeyStore
    health: HealthCheck
    embedder: EmbeddingProvider
    llm: LLMProvider
    cost: CostMeter
    ingestion: IngestionService
    retrieval: RetrievalService
    answers: AnswerService
    worker: IngestionWorker
    _closers: list[object] = field(default_factory=list)

    async def aclose(self) -> None:
        for closer in self._closers:
            fn = getattr(closer, "aclose", None) or getattr(closer, "dispose", None)
            if fn is not None:
                await fn()


def build_embedder(s: Settings) -> EmbeddingProvider:
    if s.embedding_provider == ProviderKind.OPENAI_COMPATIBLE:
        return OpenAICompatibleEmbeddings(
            base_url=s.embedding_base_url,
            api_key=s.embedding_api_key.get_secret_value() if s.embedding_api_key else None,
            model=s.embedding_model,
            dim=s.embedding_dim,
            batch_size=s.embedding_batch_size,
        )
    return HashingEmbeddingProvider(dim=s.embedding_dim, model=s.embedding_model)


def build_llm(s: Settings) -> LLMProvider:
    if s.llm_provider == ProviderKind.OPENAI_COMPATIBLE:
        return OpenAICompatibleChat(
            base_url=s.llm_base_url,
            api_key=s.llm_api_key.get_secret_value() if s.llm_api_key else None,
            model=s.llm_model,
            timeout_s=s.llm_timeout_s,
        )
    return ExtractiveFakeLLM(model=s.llm_model)


def build_reranker(s: Settings, llm: LLMProvider) -> Reranker:
    match s.reranker:
        case RerankerKind.HTTP:
            if not s.reranker_url:
                raise ValueError("RAG_RERANKER=http requires RAG_RERANKER_URL")
            return HttpCrossEncoderReranker(
                s.reranker_url,
                api_key=s.reranker_api_key.get_secret_value() if s.reranker_api_key else None,
                model=s.reranker_model,
            )
        case RerankerKind.LLM:
            return LLMReranker(llm)
        case RerankerKind.NONE:
            return NoopReranker()
        case _:
            return LexicalReranker()


def build_rewriter(s: Settings, llm: LLMProvider) -> QueryRewriter:
    if s.query_rewriter == RewriterKind.LLM:
        return LLMQueryRewriter(llm)
    return HeuristicQueryRewriter()


def build_container(settings: Settings, *, memory_store: InMemoryStore | None = None) -> Container:
    closers: list[object] = []
    db_url = settings.resolved_database_url
    if db_url is not None and memory_store is None:
        from ragplatform.adapters.postgres.database import Database
        from ragplatform.adapters.postgres.repositories import (
            PostgresApiKeyStore,
            PostgresDocumentStore,
            PostgresJobQueue,
            PostgresSearchIndex,
            PostgresSemanticCache,
            PostgresUsageLedger,
        )

        db = Database(db_url, pool_size=settings.db_pool_size)
        closers.append(db)
        documents: DocumentStore = PostgresDocumentStore(db)
        index: SearchIndex = PostgresSearchIndex(db)
        queue: JobQueue = PostgresJobQueue(db)
        cache: SemanticCache = PostgresSemanticCache(db)
        ledger: UsageLedger = PostgresUsageLedger(db)
        api_keys: ApiKeyStore = PostgresApiKeyStore(db)
        health: HealthCheck = db
    else:
        mem = memory_store or InMemoryStore()
        documents = index = queue = cache = ledger = api_keys = health = mem

    embedder = build_embedder(settings)
    llm = build_llm(settings)
    closers.extend([embedder, llm])
    cost = CostMeter(settings, ledger)
    ingestion = IngestionService(settings, documents, queue, embedder, cost)
    retrieval = RetrievalService(
        settings,
        index,
        embedder,
        build_reranker(settings, llm),
        build_rewriter(settings, llm),
        cost,
    )
    answers = AnswerService(settings, retrieval, llm, documents, cache, cost)
    worker = IngestionWorker(
        queue,
        ingestion,
        max_attempts=settings.worker_max_attempts,
        poll_interval_s=settings.worker_poll_interval_s,
    )
    return Container(
        settings=settings,
        documents=documents,
        index=index,
        queue=queue,
        cache=cache,
        ledger=ledger,
        api_keys=api_keys,
        health=health,
        embedder=embedder,
        llm=llm,
        cost=cost,
        ingestion=ingestion,
        retrieval=retrieval,
        answers=answers,
        worker=worker,
        _closers=closers,
    )
