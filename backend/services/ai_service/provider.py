"""Chat-completions orchestration: model chain, deadlines and bounded retries."""

from __future__ import annotations

from typing import Any

from http_client import ProviderError


def _build_messages(
    message: str,
    context_text: str,
    history: list[dict[str, str]] | None,
    system_prompt: str,
    history_messages: Any,
) -> list[dict[str, str]]:
    messages = [{"role": "system", "content": system_prompt}]
    if context_text:
        messages.append({"role": "system", "content": f"CONTEXT (authoritative for the selected location):\n{context_text}"})
    messages.extend(history_messages(history))
    messages.append({"role": "user", "content": message})
    return messages


def _headers(settings: Any) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }


def _build_payload(settings: Any, model: str, messages: list[dict[str, str]], max_tokens: int) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": settings.llm_temperature,
        "max_tokens": max_tokens,
    }
    # Only sent when configured: a reasoning budget is an OpenRouter-shaped
    # parameter and a plain OpenAI endpoint rejects unknown body fields. It is
    # not only a speed knob. Left unset, a reasoning model over-applies the
    # "ground everything in CONTEXT" rule and refuses ordinary questions,
    # which reaches the user as a dead assistant.
    if settings.llm_reasoning_effort:
        payload["reasoning"] = {"effort": settings.llm_reasoning_effort}
    return payload


async def _request_completion(
    model: str, settings: Any, payload: dict[str, Any], headers: dict[str, str], remaining: float, deps: dict[str, Any]
) -> tuple[dict[str, Any] | None, bool]:
    try:
            data = await deps["request_json"](
                "POST",
                f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                provider="llm",
                json_body=payload,
                headers=headers,
                timeout=min(settings.llm_timeout_s, remaining),
                retries=1,
                retry_statuses=deps["no_retry_statuses"],
            )
            return (data if isinstance(data, dict) else None), False
    except ProviderError as exc:
        # A rate limit or a 5xx on one free-tier model says nothing about the
        # next one, so the chain continues instead of giving up here.
        deps["log"].warning("llm call failed model=%s: %s", model, exc)
        return None, exc.status == 429


def _extract_choice(data: dict[str, Any], model: str, log: Any) -> tuple[dict[str, Any], str] | None:
    try:
        choice = data["choices"][0]
        content = choice["message"]["content"]
    except (KeyError, IndexError, TypeError):
        log.warning("llm returned an unexpected body shape model=%s", model)
        return None
    return choice, content


def _retry_budget(
    choice: dict[str, Any],
    max_tokens: int,
    remaining: float,
    model: str,
    max_output_tokens: int,
    log: Any,
    already_retried: bool,
) -> int | None:
    if already_retried or choice.get("finish_reason") != "length":
        return None
    if max_tokens >= max_output_tokens:
        log.warning("llm output still truncated at the maximum budget model=%s", model)
        return None
    if remaining <= 1.0:
        return None
    larger = min(max_tokens * 2, max_output_tokens)
    log.warning("llm output truncated model=%s; retrying with max_tokens=%d", model, larger)
    return larger


def _success_result(data: dict[str, Any], content: str, model: str) -> dict[str, Any]:
    usage = data.get("usage") or {}
    return {
        "response": content.strip(),
        "provider": model,
        "degraded": False,
        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
        "completion_tokens": int(usage.get("completion_tokens") or 0),
    }


async def _try_model(
    *,
    model: str,
    settings: Any,
    messages: list[dict[str, str]],
    headers: dict[str, str],
    budget_s: float,
    started: float,
    deps: dict[str, Any],
) -> tuple[dict[str, Any] | None, bool]:
    log = deps["log"]
    max_tokens = deps["output_token_budget"](settings)
    payload = _build_payload(settings, model, messages, max_tokens)
    truncated_retry = False
    while True:
        remaining = budget_s - (deps["time_module"].perf_counter() - started)
        if remaining <= 0.5:
            break
        data, limited = await _request_completion(model, settings, payload, headers, remaining, deps)
        if data is None:
            return None, limited
        parsed = _extract_choice(data, model, log)
        if parsed is None:
            break
        choice, content = parsed
        larger = _retry_budget(choice, max_tokens, remaining, model, deps["max_output_tokens"], log, truncated_retry)
        if larger is not None:
            truncated_retry = True
            max_tokens = larger
            payload = {**payload, "max_tokens": max_tokens}
            continue
        if not (content or "").strip():
            # Some reasoning endpoints answer 200 with no text and everything under
            # `reasoning`. An empty bubble reads as a dead assistant, so try the next model.
            log.warning("llm returned empty content model=%s", model)
            break
        return _success_result(data if isinstance(data, dict) else {}, content, model), False
    return None, False


def _final_result(message: str, context_text: str, rate_limited: bool, chain_len: int, deps: dict[str, Any]) -> dict[str, Any]:
    if rate_limited:
        deps["on_rate_limit"](f"all {chain_len} model(s) in the chain rate limited")
        reason = "the language model's free-tier quota is used up for today, so it resets overnight"
    else:
        reason = "the language model is unreachable"
    result = deps["degraded"](message, context_text, reason)
    return result if isinstance(result, dict) else {"response": str(result), "provider": "grounded-fallback", "degraded": True, "prompt_tokens": 0, "completion_tokens": 0}


async def generate_response(
    *,
    message: str,
    context_text: str,
    history: list[dict[str, str]] | None,
    settings: Any,
    system_prompt: str,
    history_messages: Any,
    deps: dict[str, Any],
) -> dict[str, Any]:
    """Call the chat-completions provider, walking the configured model chain."""
    messages = _build_messages(message, context_text, history, system_prompt, history_messages)
    chain = settings.llm_model_chain or ((settings.llm_model,) if settings.llm_model else ())
    if not chain:
        result = deps["degraded"](message, context_text, "the language model is not configured")
        return result if isinstance(result, dict) else {"response": str(result), "provider": "grounded-fallback", "degraded": True, "prompt_tokens": 0, "completion_tokens": 0}

    headers = _headers(settings)
    # The chain is only a latency win while it stays inside one interaction. A
    # deadline bounds the total, so four slow models cannot add up to four
    # timeouts before the user gets the grounded answer.
    budget_s = max(1.0, settings.llm_total_budget_s)
    started = deps["time_module"].perf_counter()
    rate_limited = False

    for model in chain:
        remaining = budget_s - (deps["time_module"].perf_counter() - started)
        if remaining <= 0.5:
            deps["log"].warning("llm budget exhausted after %d/%d models", chain.index(model), len(chain))
            break
        result, limited = await _try_model(
            model=model,
            settings=settings,
            messages=messages,
            headers=headers,
            budget_s=budget_s,
            started=started,
            deps=deps,
        )
        rate_limited = rate_limited or limited
        if result is not None:
            deps["on_success"]()
            return result

    return _final_result(message, context_text, rate_limited, len(chain), deps)
