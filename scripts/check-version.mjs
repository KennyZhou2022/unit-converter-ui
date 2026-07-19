import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const version = (await read("VERSION")).trim();
const packageJson = JSON.parse(await read("package.json"));
const sources = {
  changelog: await read("CHANGELOG.md"),
  "index.html title": await read("index.html"),
  "App.js fallback": await read("src/app/App.js"),
  "AppShell.js default": await read("src/features/layout/AppShell.js"),
  README: await read("README.md"),
  "release notes": await read(`release/v${version}.md`),
};

const mismatches = [];
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  mismatches.push(`VERSION is not a semantic version: ${version || "(empty)"}`);
}
if (packageJson.version !== version) {
  mismatches.push(`package.json is ${packageJson.version}; expected ${version}`);
}
if (!sources["index.html title"].includes(`<title>Unit Converter v${version}</title>`)) {
  mismatches.push("index.html title does not match VERSION");
}
if (!sources["App.js fallback"].includes(`return version || "${version}";`)) {
  mismatches.push("App.js empty VERSION fallback does not match VERSION");
}
if (!sources["App.js fallback"].includes(`return "${version}";`)) {
  mismatches.push("App.js fetch failure fallback does not match VERSION");
}
if (!sources["AppShell.js default"].includes(`appVersion = "${version}"`)) {
  mismatches.push("AppShell.js default does not match VERSION");
}
if (!sources.README.includes(`Current UI release: \`v${version}\``)) {
  mismatches.push("README current release does not match VERSION");
}
if (!sources.changelog.includes(`## [${version}]`)) {
  mismatches.push("CHANGELOG does not contain the current VERSION");
}
if (!sources["release notes"].startsWith(`# Unit Converter UI v${version}\n`)) {
  mismatches.push("release note heading does not match VERSION");
}

if (mismatches.length) {
  throw new Error(`Version check failed:\n- ${mismatches.join("\n- ")}`);
}

console.log(`Version ${version} is consistent across runtime entry points.`);
