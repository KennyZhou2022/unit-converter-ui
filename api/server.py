"""Small HTTP adapter for the unit-converter UI.

The server intentionally uses only the Python standard library. That keeps the
first UI build easy to run locally: install the backend wheel, start this file,
and the same process serves both the static frontend and the JSON API.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
from decimal import Decimal, InvalidOperation
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

try:
    from unit_converter import (
        AmbiguousConversionError,
        ConversionNotFoundError,
        IncompatibleUnitError,
        UnitNotFoundError,
        __version__ as UNIT_CONVERTER_VERSION,
        convert,
        get_ui_unit_catalog,
        get_unit_catalog,
    )

    UNIT_CONVERTER_IMPORT_ERROR: str | None = None
except Exception as error:  # pragma: no cover - exercised by environment setup.
    UNIT_CONVERTER_IMPORT_ERROR = repr(error)
    UNIT_CONVERTER_VERSION = None
    AmbiguousConversionError = Exception  # type: ignore[assignment]
    ConversionNotFoundError = Exception  # type: ignore[assignment]
    IncompatibleUnitError = Exception  # type: ignore[assignment]
    UnitNotFoundError = Exception  # type: ignore[assignment]
    convert = None  # type: ignore[assignment]
    get_ui_unit_catalog = None  # type: ignore[assignment]
    get_unit_catalog = None  # type: ignore[assignment]


ROOT_DIR = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT_DIR / "index.html"
VERSION_PATH = ROOT_DIR / "VERSION"
APP_VERSION = (ROOT_DIR / "VERSION").read_text(encoding="utf-8").strip()
MAX_REQUEST_BODY_BYTES = 16 * 1024
MAX_VALUE_LENGTH = 128
MAX_DECIMAL_DIGITS = 100
MAX_DECIMAL_EXPONENT = 1000
MAX_UNIT_LENGTH = 240
REQUEST_TIMEOUT_SECONDS = 10
DECIMAL_INPUT_PATTERN = re.compile(
    r"^[+-]?(?P<mantissa>(?:\d+\.?\d*|\.\d+))(?:[eE](?P<exponent>[+-]?\d+))?$"
)
PUBLIC_STATIC_ROOTS = (ROOT_DIR / "public", ROOT_DIR / "src")
PUBLIC_STATIC_SUFFIXES = {
    ".css",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".png",
    ".svg",
    ".ttf",
    ".webp",
    ".woff",
    ".woff2",
}


class RequestValidationError(ValueError):
    def __init__(self, status: HTTPStatus, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message

DEFAULT_PAIRS = {
    "length": ("meter (m)", "foot (ft)"),
    "area": ("square meter (m2)", "square foot (ft2)"),
    "volume": ("liter (L)", "gallon (U.S.) (gal)"),
    "weight-and-mass": ("kilogram (kg)", "pound (avoirdupois) (lb)"),
    "temperature": (
        "degree Celsius (°C) [temperature]",
        "degree Fahrenheit (°F) [temperature]",
    ),
    "temperature-interval": (
        "degree Celsius (°C) [temperature interval]",
        "degree Fahrenheit (°F) [temperature interval]",
    ),
    "time": ("second (s)", "minute (min)"),
    "speed": ("mile per hour (mi / h)", "kilometer per hour (km / h)"),
    "pressure": ("pascal (Pa)", "pound-force per square inch (psi) (lbf / in2)"),
    "energy": ("joule (J)", "British thermal unitIT (BtuIT)"),
    "power": ("watt (W)", "horsepower (550 ft · lbf / s)"),
    "force": ("newton (N)", "pound-force (lbf)"),
    "angle": ("degree (°)", "radian (rad)"),
    "acceleration": (
        "meter per second squared (m / s2)",
        "foot per second squared (ft / s2)",
    ),
    "density": ("kilogram per cubic meter (kg / m3)", "pound per cubic foot (lb / ft3)"),
}

class UnitConverterRequestHandler(BaseHTTPRequestHandler):
    server_version = f"UnitConverterUI/{APP_VERSION}"

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(REQUEST_TIMEOUT_SECONDS)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_common_headers("application/json")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self._write_json(HTTPStatus.OK, health_payload())
            return
        if parsed.path == "/api/catalog":
            if not self._require_package():
                return
            self._write_json(HTTPStatus.OK, build_ui_catalog())
            return
        if parsed.path == "/api/units":
            if not self._require_package():
                return
            params = parse_qs(parsed.query)
            category = params.get("category", [""])[0]
            self._write_json(HTTPStatus.OK, units_payload(category))
            return
        self._serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/convert":
            self._write_json(HTTPStatus.NOT_FOUND, {"error": {"code": "NOT_FOUND"}})
            return

        if not self._require_package():
            return
        try:
            payload = self._read_json()
            value, from_unit, to_unit = validate_conversion_payload(payload)
        except RequestValidationError as error:
            if error.status == HTTPStatus.REQUEST_ENTITY_TOO_LARGE:
                self.close_connection = True
            self._write_error(error.status, error.code, error.message)
            return

        try:
            assert convert is not None
            result = convert(value, from_unit, to_unit)
        except UnitNotFoundError:
            self._write_error(
                HTTPStatus.NOT_FOUND,
                "UNIT_NOT_FOUND",
                "One or both selected units are unavailable.",
            )
        except IncompatibleUnitError:
            self._write_error(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "INCOMPATIBLE_UNITS",
                "The selected units cannot be converted.",
            )
        except AmbiguousConversionError:
            self._write_error(
                HTTPStatus.CONFLICT,
                "AMBIGUOUS_CONVERSION",
                "The selected conversion is ambiguous.",
            )
        except ConversionNotFoundError:
            self._write_error(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "CONVERSION_NOT_FOUND",
                "No conversion path is available for the selected units.",
            )
        except Exception as error:  # pragma: no cover - defensive API boundary.
            self.log_error("Unhandled conversion error: %r", error)
            self._write_error(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "The conversion could not be completed.",
            )
        else:
            self._write_json(
                HTTPStatus.OK,
                {
                    "result": str(result),
                    "resultType": "Decimal",
                    "fromUnit": from_unit,
                    "toUnit": to_unit,
                },
            )

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")

    def _require_package(self) -> bool:
        if UNIT_CONVERTER_IMPORT_ERROR is None:
            return True
        self._write_error(
            HTTPStatus.SERVICE_UNAVAILABLE,
            "UNIT_CONVERTER_UNAVAILABLE",
            (
                "The conversion service is temporarily unavailable."
            ),
        )
        return False

    def _read_json(self) -> dict[str, Any]:
        validate_json_content_type(self.headers.get("Content-Type"))
        length = validate_content_length(self.headers.get("Content-Length", "0"))
        try:
            body = self.rfile.read(length).decode("utf-8")
        except (OSError, TimeoutError, UnicodeDecodeError) as error:
            raise RequestValidationError(
                HTTPStatus.BAD_REQUEST,
                "INVALID_REQUEST",
                "The request body could not be read.",
            ) from error
        if not body:
            return {}
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            raise RequestValidationError(
                HTTPStatus.BAD_REQUEST,
                "INVALID_JSON",
                "The request body must be a JSON object.",
            ) from None
        if isinstance(payload, dict):
            return payload
        raise RequestValidationError(
            HTTPStatus.BAD_REQUEST,
            "INVALID_JSON",
            "The request body must be a JSON object.",
        )

    def _serve_static(self, request_path: str) -> None:
        target = static_path_for(request_path)
        if target is None or not target.exists() or not target.is_file():
            self._write_json(HTTPStatus.NOT_FOUND, {"error": {"code": "NOT_FOUND"}})
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self._send_common_headers(content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _write_error(
        self,
        status: HTTPStatus,
        code: str,
        message: str = "",
        details: dict[str, Any] | None = None,
    ) -> None:
        self._write_json(
            status,
            {
                "error": {
                    "code": code,
                    "message": message,
                    "details": details or {},
                }
            },
        )

    def _write_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_common_headers("application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _send_common_headers(self, content_type: str) -> None:
        self.send_header("Content-Type", content_type)
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; base-uri 'none'; connect-src 'self'; "
            "font-src 'self'; frame-ancestors 'none'; img-src 'self' data:; "
            "object-src 'none'; script-src 'self'; style-src 'self'",
        )
        self.send_header("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")


def health_payload() -> dict[str, Any]:
    return {
        "ok": UNIT_CONVERTER_IMPORT_ERROR is None,
        "uiVersion": APP_VERSION,
        "packageVersion": UNIT_CONVERTER_VERSION,
    }


def validate_content_length(raw_value: str | None) -> int:
    value = "0" if raw_value is None else raw_value
    if not re.fullmatch(r"[0-9]+", value):
        raise RequestValidationError(
            HTTPStatus.BAD_REQUEST,
            "INVALID_REQUEST",
            "Content-Length must be a non-negative integer.",
        )
    length = int(value)
    if length > MAX_REQUEST_BODY_BYTES:
        raise RequestValidationError(
            HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
            "REQUEST_TOO_LARGE",
            f"Request bodies are limited to {MAX_REQUEST_BODY_BYTES} bytes.",
        )
    return length


def validate_json_content_type(raw_value: str | None) -> None:
    content_type = (raw_value or "").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise RequestValidationError(
            HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
            "UNSUPPORTED_MEDIA_TYPE",
            "Content-Type must be application/json.",
        )


def validate_conversion_payload(payload: dict[str, Any]) -> tuple[str, str, str]:
    fields = (payload.get("value"), payload.get("fromUnit"), payload.get("toUnit"))
    if not all(isinstance(field, str) for field in fields):
        raise RequestValidationError(
            HTTPStatus.BAD_REQUEST,
            "INVALID_REQUEST",
            "value, fromUnit, and toUnit must be strings.",
        )

    value, from_unit, to_unit = (field.strip() for field in fields)
    if not value or not from_unit or not to_unit:
        raise RequestValidationError(
            HTTPStatus.BAD_REQUEST,
            "INVALID_REQUEST",
            "value, fromUnit, and toUnit are required.",
        )
    if len(from_unit) > MAX_UNIT_LENGTH or len(to_unit) > MAX_UNIT_LENGTH:
        raise RequestValidationError(
            HTTPStatus.BAD_REQUEST,
            "INVALID_REQUEST",
            "Unit labels are too long.",
        )
    if len(value) > MAX_VALUE_LENGTH:
        raise _invalid_value_error()

    match = DECIMAL_INPUT_PATTERN.fullmatch(value)
    if not match:
        raise _invalid_value_error()
    digits = sum(character.isdigit() for character in match.group("mantissa"))
    exponent = int(match.group("exponent") or "0")
    if digits > MAX_DECIMAL_DIGITS or abs(exponent) > MAX_DECIMAL_EXPONENT:
        raise _invalid_value_error()
    try:
        decimal_value = Decimal(value)
    except InvalidOperation:
        raise _invalid_value_error() from None
    if not decimal_value.is_finite():
        raise _invalid_value_error()

    return value, from_unit, to_unit


def _invalid_value_error() -> RequestValidationError:
    return RequestValidationError(
        HTTPStatus.BAD_REQUEST,
        "INVALID_VALUE",
        "Enter a finite decimal or scientific-notation number within supported limits.",
    )


def build_ui_catalog() -> dict[str, Any]:
    assert get_unit_catalog is not None
    assert get_ui_unit_catalog is not None
    catalog = get_unit_catalog()
    ui_catalog = get_ui_unit_catalog()
    unit_records = catalog.get("units", [])
    unit_order = {label: index for index, label in enumerate(catalog["all_units"])}
    units_by_ui = group_units_by_ui_category(unit_records, unit_order)
    component_sets = build_component_sets(catalog)
    groups: list[dict[str, Any]] = []

    for category in ui_catalog["categories"]:
        group_name = str(category["name"])
        subcategories: list[dict[str, Any]] = []
        for subcategory in category["subcategories"]:
            subcategory_name = subcategory_name_from_catalog(subcategory)
            labels = units_by_ui.get((group_name, subcategory_name), [])
            if not labels:
                continue
            subcategories.append(
                make_subcategory(
                    group_name,
                    subcategory_name,
                    labels,
                    component_sets,
                )
            )

        if subcategories:
            groups.append(
                {
                    "name": group_name,
                    "slug": slugify(group_name),
                    "unitCount": sum(item["unitCount"] for item in subcategories),
                    "subcategories": subcategories,
                }
            )

    return {
        "version": ui_catalog["version"],
        "catalogName": ui_catalog["catalog_name"],
        "source": catalog["source"]["name"],
        "totals": catalog["totals"],
        "categories": groups,
        "allUnits": [make_unit(label) for label in catalog["all_units"]],
    }


def group_units_by_ui_category(
    unit_records: list[dict[str, Any]],
    unit_order: dict[str, int],
) -> dict[tuple[str, str], list[str]]:
    grouped: dict[tuple[str, str], list[str]] = {}
    for record in unit_records:
        label = str(record["label"])
        for ui_category in record.get("ui_categories", []):
            key = (str(ui_category["category"]), str(ui_category["subcategory"]))
            grouped.setdefault(key, []).append(label)
    for labels in grouped.values():
        labels[:] = sorted(set(labels), key=lambda label: unit_order.get(label, 10**9))
    return grouped


def build_component_sets(catalog: dict[str, Any]) -> list[frozenset[str]]:
    components: list[frozenset[str]] = []
    seen: set[tuple[str, ...]] = set()
    for category in catalog["categories"]:
        add_component_sets(components, seen, category.get("connected_components", []))
        for subcategory in category.get("subcategories", []):
            add_component_sets(
                components,
                seen,
                subcategory.get("connected_components", []),
            )
    return components


def add_component_sets(
    components: list[frozenset[str]],
    seen: set[tuple[str, ...]],
    raw_components: list[dict[str, Any]],
) -> None:
    for component in raw_components:
        labels = tuple(sorted(str(unit) for unit in component.get("units", [])))
        if len(labels) < 2 or labels in seen:
            continue
        seen.add(labels)
        components.append(frozenset(labels))


def subcategory_name_from_catalog(subcategory: str | dict[str, Any]) -> str:
    if isinstance(subcategory, str):
        return subcategory
    return str(subcategory["name"])


def make_subcategory(
    group_name: str,
    name: str,
    unit_labels: list[str],
    component_sets: list[frozenset[str]],
) -> dict[str, Any]:
    slug = slugify(name)
    units = [make_unit(label) for label in unit_labels]
    connected_components = connected_components_for(unit_labels, component_sets)
    source = {"units": unit_labels, "connected_components": connected_components}
    default_from, default_to = default_pair(slug, source)
    return {
        "name": name,
        "slug": slug,
        "sourceCategory": group_name,
        "sourceSubcategory": name,
        "unitCount": len(units),
        "defaultFromUnit": default_from,
        "defaultToUnit": default_to,
        "connectedComponents": connected_components,
        "units": units,
    }


def connected_components_for(
    unit_labels: list[str],
    component_sets: list[frozenset[str]],
) -> list[dict[str, Any]]:
    labels = set(unit_labels)
    components: list[dict[str, Any]] = []
    seen: set[tuple[str, ...]] = set()
    for component in component_sets:
        units = [label for label in unit_labels if label in component]
        key = tuple(units)
        if len(units) < 2 or key in seen:
            continue
        seen.add(key)
        components.append(
            {
                "unitCount": len(units),
                "orderedConvertiblePairCount": len(units) * (len(units) - 1),
                "units": units,
            }
        )

    uncovered_units = [
        label
        for label in unit_labels
        if label in labels
        and not any(label in component["units"] for component in components)
    ]
    if len(uncovered_units) >= 2 and not components:
        components.append(
            {
                "unitCount": len(uncovered_units),
                "orderedConvertiblePairCount": len(uncovered_units)
                * (len(uncovered_units) - 1),
                "units": uncovered_units,
            }
        )
    return components


def default_pair(slug: str, source: dict[str, Any]) -> tuple[str, str]:
    units = list(source["units"])
    preferred = DEFAULT_PAIRS.get(slug)
    if preferred and all(label in units for label in preferred):
        return preferred

    first_component = (source.get("connected_components") or [{}])[0].get(
        "units",
        units,
    )
    if len(first_component) >= 2:
        return first_component[0], first_component[1]
    if len(units) >= 2:
        return units[0], units[1]
    if units:
        return units[0], units[0]
    return "", ""


def make_unit(label: str) -> dict[str, str]:
    display_name, symbol = split_label(label)
    search_text = normalize_search_text(f"{label} {display_name} {symbol}")
    return {
        "label": label,
        "displayName": display_name,
        "symbol": symbol,
        "searchText": search_text,
    }


def split_label(label: str) -> tuple[str, str]:
    symbol = ""
    bracket_match = re.search(r"\[([^\]]+)\]\s*$", label)
    paren_matches = re.findall(r"\(([^)]{1,100})\)", label)
    if bracket_match:
        symbol = bracket_match.group(1).strip()
    elif paren_matches:
        symbol = paren_matches[-1].strip()

    display_name = re.sub(r"\s*(\[[^\]]+\]|\([^)]*\))\s*$", "", label).strip()
    return display_name or label, symbol


def normalize_search_text(value: str) -> str:
    normalized = value.casefold()
    normalized = normalized.replace("°", " degree ")
    normalized = normalized.replace("·", " ")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def slugify(value: str) -> str:
    return normalize_search_text(value).replace(" ", "-")


def units_payload(category_slug: str) -> dict[str, Any]:
    catalog = build_ui_catalog()
    if not category_slug:
        return {"units": catalog["allUnits"]}

    for group in catalog["categories"]:
        for subcategory in group["subcategories"]:
            if subcategory["slug"] == category_slug:
                return {"units": subcategory["units"], "category": subcategory}
    return {"units": []}


def static_path_for(request_path: str) -> Path | None:
    path = unquote(request_path.split("?", 1)[0])
    if path in ("", "/"):
        return INDEX_PATH

    normalized = path.lstrip("/")
    relative_path = Path(normalized)
    if not normalized or any(part.startswith(".") for part in relative_path.parts):
        return None
    try:
        candidate = (ROOT_DIR / relative_path).resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    try:
        candidate.relative_to(ROOT_DIR)
    except ValueError:
        return None

    if candidate in {INDEX_PATH, VERSION_PATH} and candidate.is_file():
        return candidate
    if (
        candidate.suffix.lower() in PUBLIC_STATIC_SUFFIXES
        and candidate.is_file()
        and any(_is_relative_to(candidate, root) for root in PUBLIC_STATIC_ROOTS)
    ):
        return candidate
    if "." not in relative_path.name and relative_path.parts[0] not in {"public", "src"}:
        return INDEX_PATH
    return None


def _is_relative_to(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Unit Converter UI server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=5173, type=int)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), UnitConverterRequestHandler)
    print(f"Unit Converter UI running at http://{args.host}:{args.port}")
    if UNIT_CONVERTER_IMPORT_ERROR:
        print(f"unit-converter import failed: {UNIT_CONVERTER_IMPORT_ERROR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
