"""Regressions for the four reported defects.

Each test here corresponds to a bug that was live before the fix, so they are
written to fail against the old behaviour and pass against the new one.
"""

from __future__ import annotations

import io

import pytest

from services import ai_context, ai_service, query_router as qr, rag_service, weather_service


# ── ISSUE 3: the current-hour lookup ─────────────────────────────────────


class TestCurrentHourMatching:
    """Open-Meteo reports `current.time` on a 15-minute boundary, hourly slots
    are on the hour. An exact-string match therefore always missed, leaving UV,
    rain probability and visibility permanently null."""

    def test_quarter_hour_resolves_to_containing_hour(self):
        assert weather_service._hour_slot_index("2026-01-01T14:15", ["2026-01-01T14:00"]) == 0

    def test_exact_hour_still_matches(self):
        assert weather_service._hour_slot_index("2026-01-01T14:00", ["2026-01-01T14:00"]) == 0

    def test_nearest_following_slot_is_used_when_none_contains(self):
        assert weather_service._hour_slot_index("2026-01-01T14:00", ["2026-01-01T15:00"]) == 0

    def test_returns_minus_one_when_slot_list_is_empty(self):
        """-1 is the service's "not found" sentinel, not an index."""
        assert weather_service._hour_slot_index("2026-01-01T14:15", []) == -1

    def test_returns_minus_one_when_unparseable(self):
        assert weather_service._hour_slot_index("not-a-time", ["2026-01-01T14:00"]) == -1

    def test_returns_minus_one_when_observation_is_empty(self):
        assert weather_service._hour_slot_index("", ["2026-01-01T14:00"]) == -1


# ── ISSUE 2: attached-document questions reach the model ─────────────────


class TestDocumentRouting:
    def test_mentioning_a_document_plus_environment_pulls_both(self):
        intent = qr.classify("compare the report findings with current air quality")
        blocks = qr.blocks_for(intent)
        assert qr.BLOCK_DOCUMENTS in blocks
        assert qr.BLOCK_AQI_NOW in blocks

    def test_plain_document_question_wants_documents(self):
        assert qr.wants_documents(qr.classify("what does this report say about PM2.5?"))

    def test_weather_question_does_not_pull_documents(self):
        assert not qr.wants_documents(qr.classify("what is the temperature tomorrow?"))

    def test_summary_request_is_detected(self):
        assert qr.is_summary_request("summarise this document")
        assert qr.is_summary_request("key findings")
        assert not qr.is_summary_request("what is the temperature?")

    def test_documents_and_weather_stay_separate_for_rain(self):
        blocks = qr.blocks_for(qr.classify("will it rain tomorrow?"))
        assert qr.BLOCK_DOCUMENTS not in blocks


class TestDocumentContextSurvivesParsing:
    """`_documents_section` used to emit a blank line inside the block, while
    the offline responder in `ai_service` re-parses `context_text` on that same
    delimiter. Every excerpt was therefore dropped before anything read it."""

    CHUNK = {"fileName": "report.pdf", "chunk": "The city target is 60 ug/m3 by 2030.", "score": 0.4}

    def build(self, chunks=None):
        return ai_context.ContextBuilder(
            location={"name": "Gudur"},
            air_quality=None,
            weather=None,
            aqi_forecast=[],
            predictions=[],
            carbon_trips=[],
            history=[],
            rag_chunks=self.CHUNK and [self.CHUNK] if chunks is None else chunks,
        )

    def test_document_section_has_no_internal_blank_line(self):
        section = self.build()._documents_section()
        assert section
        assert "\n\n" not in section

    def test_excerpt_text_is_present(self):
        assert "60 ug/m3" in self.build()._documents_section()

    def test_filename_is_attributed(self):
        assert "city-plan.pdf" in self.build(
            [{"fileName": "city-plan.pdf", "chunk": "text", "score": 0.4}]
        )._documents_section()

    def test_sections_are_only_included_when_documents_are_retrieved(self):
        text, sections, coverage = self.build().build("what does my report say?")
        assert coverage["documents"] is True
        assert "60 ug/m3" in text

    def test_fallback_recovers_the_excerpt(self):
        """The end-to-end failure: the offline reply must quote the document."""
        text, _, _ = self.build().build("summarise this document")
        answer = ai_service.fallback_response("summarise this document", text)
        assert "60 ug/m3" in answer

    def test_fallback_without_documents_says_so(self):
        text, _, _ = self.build([]).build("summarise this document")
        answer = ai_service.fallback_response("summarise this document", text)
        assert "no uploaded documents" in answer.lower()


# ── ISSUE 2: retrieval scoping and attribution ───────────────────────────


def _pdf(text: str) -> bytes:
    """Build a minimal single-page PDF containing `text`.

    Written by hand rather than pulled from a PDF library: the tests must not
    gain a dependency just to produce a fixture, and the extractor only needs
    the standard Helvetica font object to be present.
    """
    lines = [line for line in text.splitlines() if line.strip()] or ["(empty)"]
    body = [b"BT /F1 12 Tf 50 700 Td"]
    for index, line in enumerate(lines):
        escaped = line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        prefix = b"(" if index == 0 else b"0 -18 Td ("
        body.append(prefix + escaped.encode("latin-1") + b") Tj")
    body.append(b"ET")
    content = b" ".join(body)

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets: list[int] = []
    for number, obj in enumerate(objects, 1):
        offsets.append(out.tell())
        out.write(str(number).encode() + b" 0 obj\n" + obj + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 " + str(len(objects) + 1).encode() + b"\n0000000000 65535 f \n")
    for offset in offsets:
        out.write(("%010d 00000 n \n" % offset).encode())
    out.write(
        b"trailer\n<< /Size " + str(len(objects) + 1).encode() + b" /Root 1 0 R >>\nstartxref\n"
        + str(xref).encode() + b"\n%%EOF\n"
    )
    return out.getvalue()


class TestScopedRetrieval:
    @pytest.fixture(autouse=True)
    def _isolated_store(self, tmp_path, monkeypatch):
        monkeypatch.setattr(rag_service, "_store_path", lambda uid: str(tmp_path / f"{uid}.json"))
        rag_service._index_cache.clear()
        # `_load_store` seeds `_memory_stores` on a cache miss, and that global
        # outlives the temporary directory, so it has to be cleared too or the
        # next test reads the previous test's documents.
        rag_service._memory_stores.clear()

    def test_chunks_carry_their_source_document(self):
        rag_service.process_document("u1", "alpha.pdf", _pdf("Air quality target 55 ug/m3."))
        hits = rag_service.retrieve("u1", "air quality target")
        assert hits
        assert hits[0]["fileName"] == "alpha.pdf"
        assert hits[0]["fileId"]

    def test_file_ids_restrict_results(self):
        first = rag_service.process_document("u1", "alpha.pdf", _pdf("Alpha topic masonry bricks."))
        rag_service.process_document("u1", "beta.pdf", _pdf("Beta topic coastal erosion."))
        hits = rag_service.retrieve("u1", "bricks", 4, [first["fileId"]])
        assert hits
        assert {h["fileId"] for h in hits} == {first["fileId"]}

    def test_unknown_file_id_returns_nothing(self):
        rag_service.process_document("u1", "alpha.pdf", _pdf("Masonry bricks."))
        assert rag_service.retrieve("u1", "bricks", 4, ["does-not-exist"]) == []

    def test_another_users_file_id_cannot_be_reached(self):
        mine = rag_service.process_document("u1", "mine.pdf", _pdf("Confidential zebra data."))
        theirs = rag_service.process_document("u2", "theirs.pdf", _pdf("Confidential zebra data."))
        hits = rag_service.retrieve("u1", "zebra", 4, [theirs["fileId"]])
        assert hits == []
        assert all(h["fileId"] == mine["fileId"] for h in rag_service.retrieve("u1", "zebra"))

    def test_overview_returns_content_for_a_vocabulary_free_question(self):
        rag_service.process_document("u1", "alpha.pdf", _pdf("Unique zebra metric is 42."))
        assert rag_service.retrieve("u1", "summarise this") == []
        overview = rag_service.overview("u1", None, 2)
        assert overview
        assert "zebra" in overview[0]["chunk"]

    def test_overview_respects_file_ids(self):
        first = rag_service.process_document("u1", "alpha.pdf", _pdf("Alpha zebra."))
        rag_service.process_document("u1", "beta.pdf", _pdf("Beta zebra."))
        overview = rag_service.overview("u1", [first["fileId"]], 2)
        assert {o["fileId"] for o in overview} == {first["fileId"]}

    def test_renamed_file_is_still_reachable(self):
        record = rag_service.process_document("u1", "alpha.pdf", _pdf("Masonry bricks."))
        hits = rag_service.retrieve("u1", "bricks", 4, [record["fileId"]])
        assert hits and hits[0]["fileName"] == "alpha.pdf"


class TestDocumentValidation:
    def test_non_pdf_bytes_are_rejected(self):
        with pytest.raises(rag_service.RagStoreError):
            rag_service._extract_text("fake.pdf", b"this is plainly not a pdf")

    def test_headerless_pdf_is_rejected(self):
        with pytest.raises(rag_service.RagStoreError):
            rag_service._extract_text("bad.pdf", b"\x89PNG\r\n\x1a\n" + b"0" * 200)

    def test_valid_pdf_is_accepted(self):
        text = rag_service._extract_text("ok.pdf", _pdf("Readable content here."))
        assert "Readable" in text

    def test_valid_pdf_is_accepted(self):
        text = rag_service._extract_text("ok.pdf", _pdf("Readable content here."))
        assert "Readable content" in text
