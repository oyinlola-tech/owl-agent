import pytest

schemathesis = pytest.importorskip("schemathesis")
hypothesis = pytest.importorskip("hypothesis")

FUZZ_EXAMPLES_PER_OPERATION = 12
OPEN_OPERATIONS = {("GET", "/health")}
REJECTION_STATUSES = {401, 415, 421}
ALLOWED_UPSTREAM_STATUSES = {502, 503}

schema = schemathesis.pytest.from_fixture("owl_schema")
bounded_fuzz = hypothesis.settings(
    max_examples=FUZZ_EXAMPLES_PER_OPERATION,
    deadline=None,
    derandomize=True,
    database=None,
    suppress_health_check=list(hypothesis.HealthCheck),
)


def send_generated_case(client, case, headers: dict[str, str]):
    kwargs = case.as_transport_kwargs(base_url=str(client.base_url))
    merged = {k: str(v) for k, v in (kwargs.get("headers") or {}).items()}
    merged.pop("Authorization", None)
    merged.update(headers)
    body = {}
    if "json" in kwargs:
        body["json"] = kwargs["json"]
    elif kwargs.get("data") is not None:
        body["content"] = kwargs["data"]
    return client.request(
        kwargs["method"],
        kwargs["url"],
        headers=merged,
        params=kwargs.get("params"),
        **body,
    )


def is_server_failure(status: int) -> bool:
    return status >= 500 and status not in ALLOWED_UPSTREAM_STATUSES


def is_documented_method(case) -> bool:
    return case.method.upper() == case.operation.method.upper()


def assert_rejected_without_valid_token(case, response) -> None:
    status = response.status_code
    label = f"{case.method} {case.formatted_path} -> {status}"
    assert 400 <= status < 500, label
    if is_documented_method(case):
        assert status in REJECTION_STATUSES, label


@schema.parametrize()
@bounded_fuzz
def test_authenticated_fuzzing_never_crashes_the_service(case, fuzz_client, fuzz_token):
    headers = {"Authorization": f"Bearer {fuzz_token}", "Content-Type": "application/json"}
    response = send_generated_case(fuzz_client, case, headers)
    assert response.status_code not in REJECTION_STATUSES - {415} or not is_documented_method(case)
    assert not is_server_failure(response.status_code), (
        f"{case.method} {case.formatted_path} -> {response.status_code}: {response.text[:300]}"
    )


@schema.parametrize()
@bounded_fuzz
def test_unauthenticated_fuzzing_never_succeeds(case, fuzz_client):
    response = send_generated_case(fuzz_client, case, {"Content-Type": "application/json"})
    if (case.method.upper(), case.path) in OPEN_OPERATIONS and is_documented_method(case):
        assert response.status_code == 200
        return
    assert_rejected_without_valid_token(case, response)


@schema.parametrize()
@bounded_fuzz
def test_wrong_token_fuzzing_never_succeeds(case, fuzz_client):
    if (case.method.upper(), case.path) in OPEN_OPERATIONS and is_documented_method(case):
        return
    headers = {
        "Authorization": "Bearer not-the-owl-token-000000",
        "Content-Type": "application/json",
    }
    response = send_generated_case(fuzz_client, case, headers)
    assert_rejected_without_valid_token(case, response)


def test_rebinding_host_header_is_rejected(fuzz_client, fuzz_token):
    response = fuzz_client.get(
        "/tasks",
        headers={"Authorization": f"Bearer {fuzz_token}", "Host": "attacker.example:8000"},
    )
    assert response.status_code in {400, 421}


def test_non_json_body_on_mutating_route_is_rejected(fuzz_client, fuzz_token):
    response = fuzz_client.post(
        "/tasks",
        content="title=x",
        headers={
            "Authorization": f"Bearer {fuzz_token}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )
    assert response.status_code == 415


def test_token_in_query_string_only_works_for_event_stream(fuzz_client, fuzz_token):
    response = fuzz_client.get("/tasks", params={"token": fuzz_token})
    assert response.status_code == 401
