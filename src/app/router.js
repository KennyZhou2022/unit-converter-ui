export function parseRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) {
    return { name: "home" };
  }
  if (parts[0] === "units") {
    return { name: "units" };
  }
  if (parts[0] === "about" || parts[0] === "about-data") {
    return { name: "about" };
  }
  if (parts[0] === "convert" && parts.length >= 3) {
    return { name: "convert", groupSlug: parts[1], converterSlug: parts[2] };
  }
  return { name: "home" };
}
