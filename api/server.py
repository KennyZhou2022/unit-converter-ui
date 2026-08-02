"""Small HTTP adapter for the nist-unit-converter-backed UI.

The server intentionally uses only the Python standard library. That keeps the
first UI build easy to run locally: install the backend wheel, start this file,
and the same process serves both the static frontend and the JSON API.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
import unicodedata
from decimal import Decimal, InvalidOperation
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

try:
    from unit_converter import (
        ConversionError,
        IncompatibleUnitError,
        UnitNotFoundError,
        __version__ as UNIT_CONVERTER_VERSION,
        can_convert,
        compatible_units,
        convert,
        get_ui_unit_catalog,
        get_unit_catalog,
        list_categories,
        list_ui_categories,
        list_ui_subcategories,
        list_ui_unit_ids,
        list_ui_units,
        list_unit_ids,
        list_units,
    )

    UNIT_CONVERTER_IMPORT_ERROR: str | None = None
except Exception as error:  # pragma: no cover - exercised by environment setup.
    UNIT_CONVERTER_IMPORT_ERROR = repr(error)
    UNIT_CONVERTER_VERSION = None
    ConversionError = Exception  # type: ignore[assignment]
    IncompatibleUnitError = Exception  # type: ignore[assignment]
    UnitNotFoundError = Exception  # type: ignore[assignment]
    can_convert = None  # type: ignore[assignment]
    compatible_units = None  # type: ignore[assignment]
    convert = None  # type: ignore[assignment]
    get_ui_unit_catalog = None  # type: ignore[assignment]
    get_unit_catalog = None  # type: ignore[assignment]
    list_categories = None  # type: ignore[assignment]
    list_ui_categories = None  # type: ignore[assignment]
    list_ui_subcategories = None  # type: ignore[assignment]
    list_ui_unit_ids = None  # type: ignore[assignment]
    list_ui_units = None  # type: ignore[assignment]
    list_unit_ids = None  # type: ignore[assignment]
    list_units = None  # type: ignore[assignment]


ROOT_DIR = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT_DIR / "index.html"
VERSION_PATH = ROOT_DIR / "VERSION"
APP_VERSION = VERSION_PATH.read_text(encoding="utf-8").strip()
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

DEFAULT_PAIRS = {
    "length": ("unit.u0271", "unit.u0159"),
    "area": ("unit.u0411", "unit.u0406"),
    "volume": ("unit.u0262", "unit.u0177"),
    "weight-and-mass": ("unit.u0233", "unit.u0346"),
    "temperature": ("unit.u0129", "unit.u0131"),
    "temperature-interval": ("unit.u0128", "unit.u0130"),
    "time": ("unit.u0397", "unit.u0301"),
    "speed": ("unit.u0288", "unit.u0250"),
    "pressure": ("unit.u0329", "unit.u0374"),
    "energy": ("unit.u0218", "unit.u0005"),
    "power": ("unit.u0449", "unit.u0198"),
    "force": ("unit.u0305", "unit.u0365"),
    "angle": ("unit.u0127", "unit.u0385"),
    "acceleration": ("unit.u0275", "unit.u0166"),
    "density": ("unit.u0235", "unit.u0350"),
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
            compatible_with = params.get("compatibleWith", [""])[0].strip()
            category = params.get("category", [""])[0]
            try:
                payload = (
                    compatible_units_payload(compatible_with)
                    if compatible_with
                    else units_payload(category)
                )
            except UnitNotFoundError:
                self._write_error(
                    HTTPStatus.NOT_FOUND,
                    "UNIT_NOT_FOUND",
                    "The selected source unit is unavailable.",
                )
                return
            except ConversionError:
                self._write_error(
                    HTTPStatus.UNPROCESSABLE_ENTITY,
                    "CONVERSION_FAILED",
                    "Compatible units could not be loaded.",
                )
                return
            self._write_json(HTTPStatus.OK, payload)
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
            self._write_error(error.status, error.code, str(error))
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
        except ConversionError:
            self._write_error(
                HTTPStatus.UNPROCESSABLE_ENTITY,
                "CONVERSION_FAILED",
                "The conversion could not be completed.",
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
        "packageName": "nist-unit-converter",
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
            "Unit identifiers are too long.",
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
    assert list_categories is not None
    assert list_ui_categories is not None
    assert list_ui_subcategories is not None
    assert list_ui_unit_ids is not None
    assert list_ui_units is not None
    assert list_unit_ids is not None
    assert list_units is not None
    catalog = get_unit_catalog()
    ui_catalog = get_ui_unit_catalog()
    unit_records = list(catalog["units"])
    records_by_id = {
        str(record["unit_id"]): record for record in unit_records
    }
    all_display_names = tuple(list_units())
    all_unit_ids = tuple(list_unit_ids())
    if len(all_display_names) != len(all_unit_ids):
        raise RuntimeError("Unit display-name and stable-ID lists are misaligned.")

    all_units = []
    for display_name, unit_id in zip(all_display_names, all_unit_ids, strict=True):
        record = records_by_id.get(unit_id)
        if record is None or str(record["display_name"]) != display_name:
            raise RuntimeError(f"Catalog record is missing for stable unit ID {unit_id!r}.")
        all_units.append(make_unit(record))
    all_units.sort(key=unit_sort_key)

    groups: list[dict[str, Any]] = []
    for group_name in list_ui_categories():
        subcategories: list[dict[str, Any]] = []
        for subcategory_name in list_ui_subcategories(group_name):
            display_names = tuple(list_ui_units(group_name, subcategory_name))
            unit_ids = tuple(list_ui_unit_ids(group_name, subcategory_name))
            if len(display_names) != len(unit_ids):
                raise RuntimeError(
                    f"UI unit display names and IDs are misaligned for {group_name!r} "
                    f"/ {subcategory_name!r}."
                )
            if not unit_ids:
                continue
            records = []
            for display_name, unit_id in zip(display_names, unit_ids, strict=True):
                record = records_by_id.get(unit_id)
                if record is None or str(record["display_name"]) != display_name:
                    raise RuntimeError(
                        f"UI taxonomy references an unknown unit {unit_id!r}."
                    )
                records.append(record)
            subcategories.append(
                make_subcategory(group_name, subcategory_name, records)
            )

        if subcategories:
            group_unit_ids = {
                unit["unitId"]
                for subcategory in subcategories
                for unit in subcategory["units"]
            }
            groups.append(
                {
                    "name": group_name,
                    "slug": slugify(group_name),
                    "unitCount": len(group_unit_ids),
                    "subcategories": subcategories,
                }
            )

    unmapped_units = sorted(
        (
            make_unit(record)
            for record in unit_records
            if str(record.get("ui_mapping_status")) == "unmapped"
        ),
        key=unit_sort_key,
    )
    return {
        "version": catalog["version"],
        "uiCatalogVersion": ui_catalog["version"],
        "unitRegistryVersion": catalog.get("unit_registry_version"),
        "catalogName": ui_catalog["catalog_name"],
        "source": catalog["source"]["name"],
        "sourceCategories": list(list_categories()),
        "totals": catalog["totals"],
        "categories": groups,
        "allUnits": all_units,
        "unmappedUnits": unmapped_units,
    }


def make_subcategory(
    group_name: str,
    name: str,
    unit_records: list[dict[str, Any]],
) -> dict[str, Any]:
    slug = slugify(name)
    units = sorted(
        (make_unit(record) for record in unit_records),
        key=unit_sort_key,
    )
    default_from, default_to = default_pair(slug, unit_records)
    return {
        "name": name,
        "slug": slug,
        "sourceCategory": group_name,
        "sourceSubcategory": name,
        "unitCount": len(units),
        "defaultFromUnit": default_from,
        "defaultToUnit": default_to,
        "units": units,
    }


def default_pair(
    slug: str,
    unit_records: list[dict[str, Any]],
) -> tuple[str, str]:
    assert can_convert is not None
    assert compatible_units is not None
    unit_ids = {str(record["unit_id"]) for record in unit_records}
    preferred = DEFAULT_PAIRS.get(slug)
    if preferred and all(unit_id in unit_ids for unit_id in preferred):
        if can_convert(*preferred):
            return preferred

    for from_record in unit_records:
        from_id = str(from_record["unit_id"])
        compatible_display_names = set(compatible_units(from_id))
        for to_record in unit_records:
            if to_record is from_record:
                continue
            if str(to_record["display_name"]) in compatible_display_names:
                return from_id, str(to_record["unit_id"])

    if unit_records:
        unit_id = str(unit_records[0]["unit_id"])
        return unit_id, unit_id
    return "", ""


def make_unit(record: dict[str, Any]) -> dict[str, Any]:
    display_name = str(record["display_name"])
    aliases = [str(alias) for alias in record.get("aliases", [])]
    short_name, symbol = split_display_name(display_name)
    search_text = normalize_search_text(
        " ".join(
            [
                str(record["unit_id"]),
                display_name,
                short_name,
                symbol,
                *aliases,
            ]
        )
    )
    return {
        "unitId": str(record["unit_id"]),
        "quantityId": str(record["quantity_id"]),
        "displayName": display_name,
        "aliases": aliases,
        "symbol": symbol,
        "searchText": search_text,
        "uiMappingStatus": str(record["ui_mapping_status"]),
    }


def unit_sort_key(unit: dict[str, Any]) -> tuple[str, str, str, str]:
    display_name = str(unit["displayName"])
    folded = unicodedata.normalize("NFKD", display_name).casefold()
    unaccented = "".join(
        character for character in folded
        if not unicodedata.combining(character)
    )
    words = re.sub(r"[^a-z0-9]+", " ", unaccented).strip()
    return words, unaccented, display_name, str(unit["unitId"])


def split_display_name(display_name: str) -> tuple[str, str]:
    symbol = ""
    bracket_match = re.search(r"\[([^\]]+)\]\s*$", display_name)
    paren_matches = re.findall(r"\(([^)]{1,100})\)", display_name)
    if bracket_match:
        symbol = bracket_match.group(1).strip()
    elif paren_matches:
        symbol = paren_matches[-1].strip()

    short_name = re.sub(
        r"\s*(\[[^\]]+\]|\([^)]*\))\s*$",
        "",
        display_name,
    ).strip()
    return short_name or display_name, symbol


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


def compatible_units_payload(unit_key: str) -> dict[str, Any]:
    assert compatible_units is not None
    assert get_unit_catalog is not None
    unit_records = list(get_unit_catalog()["units"])
    records_by_lookup = {
        str(lookup_key): record
        for record in unit_records
        for lookup_key in (
            record["unit_id"],
            record["display_name"],
            *record.get("aliases", []),
        )
    }
    compatible_display_names = compatible_units(unit_key)
    source_record = records_by_lookup.get(unit_key)
    if source_record is None:
        raise UnitNotFoundError(f"Unknown unit: {unit_key!r}.")
    units = [
        make_unit(records_by_lookup[display_name])
        for display_name in compatible_display_names
    ]
    units.sort(key=unit_sort_key)
    return {
        "sourceUnitId": str(source_record["unit_id"]),
        "units": units,
    }


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
        and any(candidate.is_relative_to(root) for root in PUBLIC_STATIC_ROOTS)
    ):
        return candidate
    if (
        "." not in relative_path.name
        and relative_path.parts[0] not in {"api", "public", "src"}
    ):
        return INDEX_PATH
    return None

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
        print(f"nist-unit-converter import failed: {UNIT_CONVERTER_IMPORT_ERROR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
