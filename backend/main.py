import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services import air_quality_service, ai_service, carbon_service, rag_service
from services.security import get_uid

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

app = FastAPI(title="AirGuard AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "airguard-backend",
        "llmConfigured": bool(ai_service.LLM_API_KEY),
        "airQualityConfigured": bool(air_quality_service.OPENWEATHER_KEY),
    }


@app.get("/api/aqi")
def get_aqi(request: Request, lat: float | None = None, lon: float | None = None, city: str | None = None):
    get_uid(request)
    return air_quality_service.get_air_quality(lat=lat, lon=lon, city=city)


@app.get("/api/geocode/search")
def geocode_search(request: Request, q: str, limit: int = 5):
    get_uid(request)
    if not q.strip():
        return {"places": []}
    return {"places": air_quality_service.search_places(q.strip(), max(1, min(limit, 10)))}


@app.get("/api/geocode/reverse")
def geocode_reverse(request: Request, lat: float, lon: float):
    get_uid(request)
    return air_quality_service.reverse_geocode_full(lat, lon)


@app.get("/api/predictions")
def get_predictions(request: Request, lat: float | None = None, lon: float | None = None, city: str | None = None):
    uid = get_uid(request)
    current = air_quality_service.get_air_quality(lat=lat, lon=lon, city=city)
    forecasts = _build_forecast(current["aqi"], current["pollutants"])
    return {"predictions": forecasts, "location": current["location"], "source": current["source"]}


def _build_forecast(aqi: int, pollutants: list):
    import random

    rnd = random.Random(aqi)
    offsets = [0, 3, 6, 12, 24]
    labels = ["Now", "+3 hours", "+6 hours", "+12 hours", "+24 hours"]
    confidences = [100, 94, 88, 81, 73]

    def poll(key, factor):
        for p in pollutants:
            if p["id"] == key:
                return round(p["value"] * factor, 2)
        return round(50 * factor, 2)

    base_factor = [1.0, 1.08, 1.18, 1.1, 0.93]
    forecasts = []
    for i, (off, label, conf, factor) in enumerate(zip(offsets, labels, confidences, base_factor)):
        noise = rnd.uniform(-0.05, 0.05)
        f = max(0.7, factor + noise)
        f_aqi = max(15, round(aqi * f))
        status = air_quality_service.aqi_category(f_aqi)
        dominant = next((p["name"] for p in pollutants if p["id"] == "pm25"), "PM2.5")
        forecasts.append({
            "timeOffsetHours": off,
            "label": label,
            "aqi": f_aqi,
            "confidence": conf,
            "pm25": poll("pm25", f),
            "pm10": poll("pm10", f),
            "no2": poll("no2", f),
            "so2": poll("so2", f),
            "co": poll("co", f),
            "o3": poll("o3", f),
            "dominantPollutant": dominant,
            "status": status,
        })
    return forecasts


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    aqHistory: list | None = None
    carbonTrips: list | None = None
    predictions: list | None = None
    currentLocation: str | None = None


@app.post("/api/ai/chat")
async def chat(req: ChatRequest, request: Request):
    uid = get_uid(request)
    rag_chunks = rag_service.retrieve(uid, req.message, top_k=4)
    context_text = ai_service._format_context(
        req.aqHistory or [], req.predictions or [], req.carbonTrips or [], rag_chunks,
        current_location=req.currentLocation,
    )
    response = await ai_service.generate_response(req.message, context_text)
    return {"response": response, "contextUsed": len(rag_chunks) > 0}


@app.post("/api/rag/upload")
async def rag_upload(request: Request, file: UploadFile = File(...)):
    uid = get_uid(request)
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 10MB limit")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ("pdf", "csv", "txt"):
        raise HTTPException(status_code=400, detail="Only PDF, CSV and TXT files are supported")
    result = rag_service.process_document(uid, file.filename, data)
    return result


@app.get("/api/rag/files")
def rag_files(request: Request):
    uid = get_uid(request)
    return {"files": rag_service.list_documents(uid)}


@app.delete("/api/rag/files/{file_id}")
def rag_delete(file_id: str, request: Request):
    uid = get_uid(request)
    if not rag_service.delete_document(uid, file_id):
        raise HTTPException(status_code=404, detail="File not found")
    return {"status": "deleted"}


class CarbonRequest(BaseModel):
    origin: str = Field(..., min_length=1)
    destination: str = Field(..., min_length=1)
    distanceKm: float | None = None
    mode: str = "Car"


class DistanceRequest(BaseModel):
    origin: str = Field(..., min_length=1)
    destination: str = Field(..., min_length=1)


@app.post("/api/carbon/estimate-distance")
def estimate_distance(req: DistanceRequest):
    lat1, lon1 = carbon_service._geocode(req.origin)
    lat2, lon2 = carbon_service._geocode(req.destination)
    if lat1 is None or lat2 is None:
        raise HTTPException(status_code=400, detail="Could not geocode one or both locations.")
    distance = carbon_service._haversine(lat1, lon1, lat2, lon2)
    return {"distanceKm": round(distance, 2)}


@app.post("/api/carbon/calculate")
def carbon_calculate(req: CarbonRequest, request: Request):
    get_uid(request)
    try:
        return carbon_service.calculate_carbon(req.origin, req.destination, req.distanceKm, req.mode)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
