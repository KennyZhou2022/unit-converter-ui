from __future__ import annotations

import json
import re
import threading
import unicodedata
import unittest
from http import HTTPStatus
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from api import server


def alphabetical_name(value: str) -> tuple[str, str, str]:
    folded = unicodedata.normalize("NFKD", value).casefold()
    unaccented = "".join(
        character for character in folded
        if not unicodedata.combining(character)
    )
    words = re.sub(r"[^a-z0-9]+", " ", unaccented).strip()
    return words, unaccented, value


class StaticPathTests(unittest.TestCase):
    def test_serves_only_public_ui_files_and_spa_routes(self) -> None:
        self.assertEqual(server.static_path_for("/"), server.INDEX_PATH)
        self.assertEqual(server.static_path_for("/index.html"), server.INDEX_PATH)
        self.assertEqual(server.static_path_for("/about"), server.INDEX_PATH)
        self.assertEqual(
            server.static_path_for("/src/app/main.js"),
            server.ROOT_DIR / "src/app/main.js",
        )
        self.assertEqual(
            server.static_path_for("/public/favicon.svg"),
            server.ROOT_DIR / "public/favicon.svg",
        )
        self.assertEqual(
            server.static_path_for("/VERSION"),
            server.ROOT_DIR / "VERSION",
        )

    def test_rejects_repository_metadata_and_server_files(self) -> None:
        for path in (
            "/.git/config",
            "/.env",
            "/api/unknown",
            "/api/server.py",
            "/scripts/dev.sh",
            "/vendor/wheels/unit_converter.whl",
            "/release/v1.1.0.md",
            "/src/../api/server.py",
            "/src/app/main.js%00",
            "/%2e%2e/%2e%2e/etc/passwd",
        ):
            with self.subTest(path=path):
                self.assertIsNone(server.static_path_for(path))


class RequestValidationTests(unittest.TestCase):
    def test_accepts_bounded_decimal_conversion_payload(self) -> None:
        payload = {
            "value": "-1.25e3",
            "fromUnit": "meter (m)",
            "toUnit": "foot (ft)",
        }

        self.assertEqual(
            server.validate_conversion_payload(payload),
            ("-1.25e3", "meter (m)", "foot (ft)"),
        )

    def test_rejects_non_finite_or_unbounded_values(self) -> None:
        invalid_values = (
            "NaN",
            "Infinity",
            "1e1001",
            "9" * (server.MAX_DECIMAL_DIGITS + 1),
        )

        for value in invalid_values:
            with self.subTest(value=value):
                with self.assertRaises(server.RequestValidationError) as raised:
                    server.validate_conversion_payload(
                        {
                            "value": value,
                            "fromUnit": "meter (m)",
                            "toUnit": "foot (ft)",
                        }
                    )
                self.assertEqual(raised.exception.code, "INVALID_VALUE")

    def test_rejects_non_string_and_oversized_unit_fields(self) -> None:
        for payload in (
            {"value": 1, "fromUnit": "meter (m)", "toUnit": "foot (ft)"},
            {"value": "1", "fromUnit": "x" * 241, "toUnit": "foot (ft)"},
        ):
            with self.subTest(payload=payload):
                with self.assertRaises(server.RequestValidationError) as raised:
                    server.validate_conversion_payload(payload)
                self.assertEqual(raised.exception.status, HTTPStatus.BAD_REQUEST)

    def test_caps_request_body_length(self) -> None:
        self.assertEqual(server.validate_content_length("128"), 128)

        with self.assertRaises(server.RequestValidationError) as raised:
            server.validate_content_length(str(server.MAX_REQUEST_BODY_BYTES + 1))
        self.assertEqual(raised.exception.status, HTTPStatus.REQUEST_ENTITY_TOO_LARGE)

        for value in ("invalid", "-1", "+10", " 10", "1_0"):
            with self.subTest(value=value):
                with self.assertRaises(server.RequestValidationError):
                    server.validate_content_length(value)

    def test_requires_a_json_content_type(self) -> None:
        server.validate_json_content_type("application/json")
        server.validate_json_content_type("application/json; charset=utf-8")

        for value in (None, "text/plain", "application/jsonp"):
            with self.subTest(value=value):
                with self.assertRaises(server.RequestValidationError) as raised:
                    server.validate_json_content_type(value)
                self.assertEqual(
                    raised.exception.status,
                    HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                )


class ErrorDisclosureTests(unittest.TestCase):
    def test_health_payload_does_not_expose_import_errors(self) -> None:
        self.assertNotIn("importError", server.health_payload())


class CatalogV2MigrationTests(unittest.TestCase):
    def test_builds_schema_v3_catalog_with_stable_unit_ids(self) -> None:
        catalog = server.build_ui_catalog()

        self.assertEqual(catalog["version"], 3)
        self.assertEqual(catalog["totals"]["unit_count"], 462)
        self.assertEqual(len(catalog["allUnits"]), 462)
        meter = next(
            unit for unit in catalog["allUnits"]
            if unit["displayName"] == "meter (m)"
        )
        self.assertEqual(meter["unitId"], "unit.u0271")
        self.assertEqual(meter["quantityId"], "quantity.q0022")
        self.assertNotIn("label", meter)

    def test_builds_ui_taxonomy_from_direct_ui_mappings(self) -> None:
        catalog = server.build_ui_catalog()
        mechanics = next(
            category for category in catalog["categories"]
            if category["name"] == "Mechanics Converters"
        )
        speed = next(
            subcategory for subcategory in mechanics["subcategories"]
            if subcategory["name"] == "Speed"
        )

        self.assertEqual(speed["unitCount"], 10)
        self.assertIn("unit.u0288", {unit["unitId"] for unit in speed["units"]})
        self.assertIn("unit.u0250", {unit["unitId"] for unit in speed["units"]})
        self.assertTrue(speed["defaultFromUnit"].startswith("unit.u"))
        self.assertTrue(speed["defaultToUnit"].startswith("unit.u"))

    def test_keeps_unmapped_units_out_of_converter_categories(self) -> None:
        catalog = server.build_ui_catalog()
        categorized_ids = {
            unit["unitId"]
            for category in catalog["categories"]
            for subcategory in category["subcategories"]
            for unit in subcategory["units"]
        }

        self.assertEqual(len(catalog["unmappedUnits"]), 5)
        self.assertEqual(catalog["totals"]["unit_ui_mapping_count"], 457)
        self.assertEqual(catalog["totals"]["unmapped_ui_unit_count"], 5)
        self.assertTrue(
            all(unit["unitId"] not in categorized_ids for unit in catalog["unmappedUnits"])
        )

    def test_orders_every_catalog_unit_list_alphabetically(self) -> None:
        catalog = server.build_ui_catalog()
        unit_lists = [catalog["allUnits"], catalog["unmappedUnits"]]
        unit_lists.extend(
            subcategory["units"]
            for category in catalog["categories"]
            for subcategory in category["subcategories"]
        )

        for units in unit_lists:
            names = [unit["displayName"] for unit in units]
            with self.subTest(first_name=names[0] if names else ""):
                self.assertEqual(names, sorted(names, key=alphabetical_name))

        self.assertEqual(
            [unit["displayName"] for unit in catalog["allUnits"][:4]],
            ["abampere", "abcoulomb", "abfarad", "abhenry"],
        )
        names = [unit["displayName"] for unit in catalog["allUnits"]]
        self.assertLess(
            names.index("ton-force (2000 lbf)"),
            names.index("ton, short, per hour"),
        )

    def test_compatible_units_payload_returns_stable_ids(self) -> None:
        payload = server.compatible_units_payload("unit.u0288")

        self.assertEqual(payload["sourceUnitId"], "unit.u0288")
        self.assertEqual(len(payload["units"]), 10)
        self.assertIn("unit.u0250", {unit["unitId"] for unit in payload["units"]})

    def test_orders_compatible_unit_results_alphabetically(self) -> None:
        payload = server.compatible_units_payload("unit.u0288")
        names = [unit["displayName"] for unit in payload["units"]]

        self.assertEqual(names, sorted(names, key=alphabetical_name))


class ApiV2IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = server.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            server.UnitConverterRequestHandler,
        )
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.httpd.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def request_json(
        self,
        path: str,
        payload: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, object]]:
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            headers={"Content-Type": "application/json"} if data else {},
        )
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                return error.code, json.loads(error.read().decode("utf-8"))
            finally:
                error.close()

    def test_converts_stable_ids_and_serializes_decimal_as_string(self) -> None:
        status, payload = self.request_json(
            "/api/convert",
            {
                "value": "1",
                "fromUnit": "unit.u0288",
                "toUnit": "unit.u0250",
            },
        )

        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(payload["result"], "1.609344")
        self.assertEqual(payload["resultType"], "Decimal")

    def test_returns_compatible_units_for_selected_from_unit(self) -> None:
        status, payload = self.request_json(
            "/api/units?compatibleWith=unit.u0288",
        )

        self.assertEqual(status, HTTPStatus.OK)
        self.assertEqual(payload["sourceUnitId"], "unit.u0288")
        self.assertIn("unit.u0250", {unit["unitId"] for unit in payload["units"]})

    def test_returns_clear_unknown_and_incompatible_unit_errors(self) -> None:
        unknown_status, unknown = self.request_json(
            "/api/convert",
            {
                "value": "1",
                "fromUnit": "unit.unknown",
                "toUnit": "unit.u0271",
            },
        )
        incompatible_status, incompatible = self.request_json(
            "/api/convert",
            {
                "value": "1",
                "fromUnit": "unit.u0271",
                "toUnit": "unit.u0397",
            },
        )

        self.assertEqual(unknown_status, HTTPStatus.NOT_FOUND)
        self.assertEqual(unknown["error"]["code"], "UNIT_NOT_FOUND")
        self.assertEqual(incompatible_status, HTTPStatus.UNPROCESSABLE_ENTITY)
        self.assertEqual(incompatible["error"]["code"], "INCOMPATIBLE_UNITS")

    def test_maps_other_conversion_errors_to_a_stable_api_error(self) -> None:
        with patch.object(
            server,
            "convert",
            side_effect=server.ConversionError("conversion failed"),
        ):
            status, payload = self.request_json(
                "/api/convert",
                {
                    "value": "1",
                    "fromUnit": "unit.u0271",
                    "toUnit": "unit.u0271",
                },
            )

        self.assertEqual(status, HTTPStatus.UNPROCESSABLE_ENTITY)
        self.assertEqual(payload["error"]["code"], "CONVERSION_FAILED")


if __name__ == "__main__":
    unittest.main()
