"""Air-quality math and assembly.

The EPA breakpoint tables are the part of this codebase most likely to be broken
by an innocent-looking edit, so they are pinned against published reference values.
"""

from __future__ import annotations

import pytest

from services import air_quality_service as aq


class TestSubIndex:
    @pytest.mark.parametrize(
        "value,breaks,expected",
        [
            # PM2.5 breakpoints, EPA Table 2.
            (0.0, aq.PM25_BREAKS, 0),
            (12.0, aq.PM25_BREAKS, 50),
            (55.4, aq.PM25_BREAKS, 150),
            (150.4, aq.PM25_BREAKS, 200),
            (500.4, aq.PM25_BREAKS, 500),
            # Mid-segment interpolation: halfway between 12.0->50 and 35.4->100.
            (23.7, aq.PM25_BREAKS, 75),
        ],
    )
    def test_pm25_breaks(self, value, breaks, expected):
        assert aq._sub_index(value, breaks) == expected

    def test_pm25_is_monotonic(self):
        values = [aq._sub_index(v, aq.PM25_BREAKS) for v in range(0, 260, 5)]
        assert values == sorted(values)

    def test_ozone_uses_ppb_conversion(self):
        """O3 breakpoints are stated in ppb, so compute_aqi must convert µg/m³ first.

        The 51-100 AQI band ends at 54 ppb, i.e. 54 x 1.96 = 105.8 µg/m³. Skipping
        the conversion would score that same air sample far too low.
        """
        sub = aq.compute_aqi({"o3": 54.0 * 1.96})["sub"]
        assert sub["o3"] == pytest.approx(50, abs=1)

    def test_no2_uses_ppb_conversion(self):
        # 53 ppb -> 53 x 1.88 = 99.6 µg/m³, the top of the 0-50 AQI band.
        sub = aq.compute_aqi({"no2": 53.0 * 1.88})["sub"]
        assert sub["no2"] == pytest.approx(50, abs=1)

    def test_so2_uses_ppb_conversion(self):
        # 35 ppb -> 35 x 2.62 = 91.7 µg/m³, the top of the 0-50 AQI band.
        sub = aq.compute_aqi({"so2": 35.0 * 2.62})["sub"]
        assert sub["so2"] == pytest.approx(50, abs=1)

    def test_co_uses_ppm_conversion(self):
        """CO breakpoints are in ppm: µg/m³ -> mg/m³ (/1000) -> ppm (/1.15)."""
        assert aq._sub_index(4.4, aq.CO_BREAKS) == pytest.approx(50, abs=1)


class TestComputeAqi:
    def test_clean_air_is_good(self):
        result = aq.compute_aqi(
            {"pm2_5": 5.0, "pm10": 10.0, "no2": 5.0, "so2": 2.0, "co": 200.0, "o3": 20.0}
        )
        assert result["aqi"] <= 50
        assert aq.aqi_category(result["aqi"]) == "Good"

    def test_particulate_drive_dominates(self):
        result = aq.compute_aqi(
            {"pm2_5": 180.0, "pm10": 90.0, "no2": 20.0, "so2": 5.0, "co": 400.0, "o3": 30.0}
        )
        assert result["dominant"] == "pm25"
        assert result["aqi"] >= 200

    def test_ozone_can_dominate(self):
        result = aq.compute_aqi(
            {"pm2_5": 5.0, "pm10": 10.0, "no2": 20.0, "so2": 5.0, "co": 300.0, "o3": 260.0}
        )
        assert result["dominant"] == "o3"

    def test_aqi_is_max_sub_index(self):
        components = {"pm2_5": 60.0, "pm10": 200.0, "no2": 40.0, "so2": 5.0, "co": 500.0, "o3": 50.0}
        result = aq.compute_aqi(components)
        assert result["aqi"] == max(result["sub"].values())

    def test_missing_pollutants_do_not_crash(self):
        result = aq.compute_aqi({"pm2_5": 40.0})
        assert result["aqi"] > 0
        assert set(result["sub"]) == {"pm25", "pm10", "o3", "no2", "so2", "co"}


class TestAqiCategory:
    @pytest.mark.parametrize(
        "aqi,expected",
        [
            (0, "Good"),
            (50, "Good"),
            (51, "Moderate"),
            (100, "Moderate"),
            (101, "Unhealthy for Sensitive Groups"),
            (150, "Unhealthy for Sensitive Groups"),
            (151, "Unhealthy"),
            (200, "Unhealthy"),
            (201, "Very Unhealthy"),
            (300, "Very Unhealthy"),
            (301, "Hazardous"),
            (500, "Hazardous"),
        ],
    )
    def test_bands(self, aqi, expected):
        assert aq.aqi_category(aqi) == expected


class TestPollutants:
    def test_co_is_reported_in_milligrams(self):
        rows = aq.pollutants_from_components({"co": 900.0, "pm2_5": 20.0})
        by_id = {row["id"]: row for row in rows}
        assert by_id["co"]["value"] == pytest.approx(0.9)
        assert by_id["co"]["unit"] == "mg/m³"

    def test_particulates_are_reported_in_micrograms(self):
        rows = aq.pollutants_from_components({"pm2_5": 42.5})
        by_id = {row["id"]: row for row in rows}
        assert by_id["pm25"]["value"] == pytest.approx(42.5)
        assert by_id["pm25"]["unit"] == "µg/m³"

    def test_status_uses_each_pollutants_own_limit(self):
        rows = aq.pollutants_from_components({"pm2_5": 40.0, "no2": 40.0})
        by_id = {row["id"]: row for row in rows}
        # PM2.5 limit is 35, NO2 is 100.
        assert by_id["pm25"]["status"] == "High"
        assert by_id["no2"]["status"] == "Good"

    def test_empty_components_still_produce_a_row(self):
        assert len(aq.pollutants_from_components({})) == 1

    def test_sub_index_is_attached(self):
        calc = aq.compute_aqi({"pm2_5": 60.0})
        rows = aq.pollutants_from_components({"pm2_5": 60.0}, calc["sub"])
        by_id = {row["id"]: row for row in rows}
        assert by_id["pm25"]["subIndex"] == calc["sub"]["pm25"]


class TestEstimatedComponents:
    def test_is_deterministic_for_a_location(self):
        first = aq.build_estimated_components(14.1489, 79.8530)
        second = aq.build_estimated_components(14.1489, 79.8530)
        assert first == second

    def test_differs_between_locations(self):
        assert aq.build_estimated_components(14.1489, 79.8530) != aq.build_estimated_components(28.61, 77.20)


class TestHistorical:
    def test_shape_and_pivot(self):
        points = aq.build_historical(100, {"pm2_5": 60.0, "co": 900.0})
        assert len(points) == 12
        assert all("time" in p and "aqi" in p for p in points)
        # A diurnal profile should have a low and a high point, not a flat line.
        values = [p["aqi"] for p in points]
        assert max(values) > min(values)
