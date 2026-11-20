from __future__ import annotations

from services import carbon_service


def test_estimate_distance_returns_distance(client, auth, monkeypatch):
    async def fake_estimate(origin: str, destination: str) -> float:
        assert (origin, destination) == ("Hyderabad", "Delhi")
        return 12.34

    monkeypatch.setattr(carbon_service, "estimate_distance", fake_estimate)
    response = client.post(
        "/api/carbon/estimate-distance",
        json={"origin": " Hyderabad ", "destination": "Delhi"},
        headers=auth,
    )
    assert response.status_code == 200
    assert response.json() == {"distanceKm": 12.34}


def test_estimate_distance_reports_unresolved_places(client, auth, monkeypatch):
    async def fake_estimate(origin: str, destination: str) -> None:
        return None

    monkeypatch.setattr(carbon_service, "estimate_distance", fake_estimate)
    response = client.post(
        "/api/carbon/estimate-distance",
        json={"origin": "nowhere", "destination": "elsewhere"},
        headers=auth,
    )
    assert response.status_code == 400
    assert "could not resolve" in response.json()["detail"].lower()


def test_calculate_returns_service_payload(client, auth, monkeypatch):
    payload = {
        "origin": "Home",
        "destination": "Work",
        "distanceKm": 10.0,
        "mode": "Bus",
        "co2eKg": 0.89,
        "savings": 1.03,
        "estimated": False,
    }

    async def fake_calculate(origin, destination, distance_km, mode):
        return payload

    monkeypatch.setattr(carbon_service, "calculate_carbon", fake_calculate)
    response = client.post(
        "/api/carbon/calculate",
        json={"origin": "Home", "destination": "Work", "distanceKm": 10, "mode": "Bus"},
        headers=auth,
    )
    assert response.status_code == 200
    assert response.json() == payload


def test_calculate_translates_value_error_to_client_error(client, auth, monkeypatch):
    async def fake_calculate(origin, destination, distance_km, mode):
        raise ValueError("Distance required")

    monkeypatch.setattr(carbon_service, "calculate_carbon", fake_calculate)
    response = client.post(
        "/api/carbon/calculate",
        json={"origin": "Home", "destination": "Work"},
        headers=auth,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Distance required"
