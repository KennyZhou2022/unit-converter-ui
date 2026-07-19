from __future__ import annotations

import unittest
from http import HTTPStatus

from api import server


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


if __name__ == "__main__":
    unittest.main()
