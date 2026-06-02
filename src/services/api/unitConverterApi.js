import { request } from "./client.js";

export const unitConverterApi = {
  health() {
    return request("/api/health");
  },

  catalog() {
    return request("/api/catalog");
  },

  units(categorySlug) {
    const query = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : "";
    return request(`/api/units${query}`);
  },

  convert({ value, fromUnit, toUnit }) {
    return request("/api/convert", {
      method: "POST",
      body: JSON.stringify({ value, fromUnit, toUnit }),
    });
  },
};

