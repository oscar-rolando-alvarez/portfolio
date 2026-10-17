"""End-to-end GraphQL tests against the real app (SQLite, fake embeddings, in-memory stores)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import GraphQL

ITEMS = "query($c: String) { items(category: $c, limit: 50) { id title category tags } }"
RECS = "query($s: Strategy!) { recommendations(strategy: $s, limit: 5) { score reason item { id title category } } }"
INTERACT = "mutation($id: ID!, $t: InteractionType!, $v: Float) { recordInteraction(itemId: $id, type: $t, value: $v) { id type value } }"


def _item_ids(gql: GraphQL) -> dict[str, str]:
    return {i["title"]: i["id"] for i in gql(ITEMS)["data"]["items"]}


def test_health_and_metrics(client: TestClient):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["checks"] == {"database": "ok", "cache": "ok"}
    assert health.headers["x-request-id"]

    client.post("/graphql", json={"query": "{ items(limit: 1) { id } }"})
    metrics = client.get("/metrics").text
    assert "http_requests_total" in metrics


def test_catalog_queries(gql: GraphQL):
    all_items = gql(ITEMS)["data"]["items"]
    assert len(all_items) == 12

    books = gql(ITEMS, c="BOOKS")["data"]["items"]
    assert {i["category"] for i in books} == {"books"}

    one = gql("query($id: ID!) { item(id: $id) { title } }", id=books[0]["id"])
    assert one["data"]["item"]["title"] == books[0]["title"]

    missing = gql('query { item(id: "00000000-0000-0000-0000-000000000000") { title } }')
    assert missing["data"]["item"] is None

    bad = gql('query { item(id: "not-a-uuid") { title } }')
    assert "Invalid id" in bad["errors"][0]["message"]


def test_semantic_search_ranks_relevant_items(gql: GraphQL):
    body = gql(
        "query($q: String!) { semanticSearch(query: $q, limit: 3) { score item { title } } }",
        q="large language models embeddings and retrieval",
    )
    titles = [r["item"]["title"] for r in body["data"]["semanticSearch"]]

    assert titles[0] == "Hands-On Large Language Models"
    assert gql('query { semanticSearch(query: "   ") { score } }')["data"]["semanticSearch"] == []


def test_similar_items(gql: GraphQL):
    ids = _item_ids(gql)
    body = gql(
        "query($id: ID!) { similarItems(itemId: $id, limit: 3) { item { title category } } }",
        id=ids["Trail Running Shoes"],
    )
    similar = body["data"]["similarItems"]

    assert len(similar) == 3
    assert "Trail Running Shoes" not in {s["item"]["title"] for s in similar}
    assert similar[0]["item"]["category"] == "sports"


def test_auth_flow_and_permissions(gql: GraphQL):
    denied = gql(RECS, s="HYBRID")
    assert denied["errors"][0]["message"] == "Authentication required"

    gql.login_new_user()
    me = gql("{ me { email username } }")["data"]["me"]
    assert me == {"email": "ada@example.com", "username": "ada"}

    duplicate = gql(
        'mutation { register(email: "ADA@example.com", username: "x", password: "another-pass") { token } }'
    )
    assert duplicate["errors"][0]["message"] == "Email already registered"

    login = gql(
        'mutation { login(email: "ada@example.com", password: "s3cret-pass") { user { email } } }'
    )
    assert login["data"]["login"]["user"]["email"] == "ada@example.com"

    bad_login = gql('mutation { login(email: "ada@example.com", password: "nope-nope") { token } }')
    assert bad_login["errors"][0]["message"] == "Invalid credentials"

    weak = gql(
        'mutation { register(email: "b@example.com", username: "b", password: "short") { token } }'
    )
    assert "at least 8" in weak["errors"][0]["message"]


def test_personalized_recommendations_follow_interactions(gql: GraphQL):
    ids = _item_ids(gql)
    # Another user creates co-engagement between LLM and deep learning books.
    gql.login_new_user("other@example.com")
    for title in ("Hands-On Large Language Models", "Deep Learning with Python"):
        gql(INTERACT, id=ids[title], t="PURCHASE")

    gql.login_new_user("ada@example.com")
    cold = gql(RECS, s="HYBRID")["data"]["recommendations"]
    assert cold
    assert cold[0]["reason"] == "Popular with other users"

    result = gql(INTERACT, id=ids["Hands-On Large Language Models"], t="RATING", v=5)
    assert result["data"]["recordInteraction"]["type"] == "RATING"

    collaborative = gql(RECS, s="COLLABORATIVE")["data"]["recommendations"]
    assert collaborative[0]["item"]["title"] == "Deep Learning with Python"

    semantic = gql(RECS, s="SEMANTIC")["data"]["recommendations"]
    assert semantic[0]["item"]["category"] == "books"

    hybrid = gql(RECS, s="HYBRID")["data"]["recommendations"]
    titles = [r["item"]["title"] for r in hybrid]
    assert "Hands-On Large Language Models" not in titles  # already consumed
    assert titles[0] == "Deep Learning with Python"
    # Served from cache on repeat (same model version).
    assert gql(RECS, s="HYBRID")["data"]["recommendations"] == hybrid


def test_interaction_validation(gql: GraphQL):
    ids = _item_ids(gql)
    gql.login_new_user()

    no_value = gql(INTERACT, id=ids["Yoga Mat"], t="RATING")
    assert "between 1 and 5" in no_value["errors"][0]["message"]

    unknown = gql(INTERACT, id="00000000-0000-0000-0000-000000000000", t="LIKE")
    assert unknown["errors"][0]["message"] == "Item not found"


def test_create_item_is_indexed_for_semantic_search(gql: GraphQL):
    gql.login_new_user()
    created = gql(
        "mutation($i: ItemInput!) { createItem(input: $i) { id tags } }",
        i={
            "title": "Espresso Machine",
            "description": "Barista grade espresso and cappuccino coffee maker",
            "category": "kitchen",
            "tags": [" Coffee ", ""],
        },
    )["data"]["createItem"]
    assert created["tags"] == ["coffee"]

    hits = gql('{ semanticSearch(query: "espresso coffee maker", limit: 1) { item { id } } }')
    assert hits["data"]["semanticSearch"][0]["item"]["id"] == created["id"]


def test_query_depth_and_limits(gql: GraphQL):
    body = gql("{ items(limit: 1000) { id } }")
    assert len(body["data"]["items"]) == 12  # clamped to MAX_LIMIT (50) and catalog size

    deep = gql('{ similarItems(itemId: "00000000-0000-0000-0000-000000000000") { item { id } } }')
    assert deep["data"]["similarItems"] == []


def test_unexpected_errors_are_masked(gql: GraphQL, monkeypatch):
    service = gql.client.app.state.recommendations  # type: ignore[attr-defined]

    async def boom(*args: object, **kwargs: object) -> None:
        raise RuntimeError("database password is hunter2")

    monkeypatch.setattr(service, "semantic_search", boom)
    body = gql('{ semanticSearch(query: "x") { score } }')

    assert body["errors"][0]["message"] == "Unexpected error."
    assert "hunter2" not in str(body)


async def test_depth_limit_rejects_deep_queries():
    from recommender.graphql.schema import build_schema

    schema = build_schema(max_depth=1)
    result = await schema.execute('{ similarItems(itemId: "x") { item { id } } }')

    assert result.errors
    assert "exceeds maximum operation depth" in result.errors[0].message
