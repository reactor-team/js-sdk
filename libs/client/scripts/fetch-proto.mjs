#!/usr/bin/env node

import { execSync } from "child_process";
import { readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Read package.json to get protobufs version
const packageJson = JSON.parse(
  readFileSync(join(rootDir, "package.json"), "utf-8")
);
const version = packageJson.protobufsVersion;

if (!version) {
  console.error("Error: protobufsVersion not found in package.json");
  process.exit(1);
}

// Parse version: "0.4.0-gdd889dd" -> semver "0.4.0", tag "v0.4.0-gdd889dd"
// The semver is everything before an optional "-g" suffix (git commit hash)
const semverMatch = version.match(/^(\d+\.\d+\.\d+)/);
if (!semverMatch) {
  console.error(
    `Error: Invalid version format "${version}". Expected semver like "0.4.0" or "0.4.0-gdd889dd"`
  );
  process.exit(1);
}
const semver = semverMatch[1];
const tag = `v${version}`;

// Check for GitHub token
const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!ghToken) {
  console.error(
    "Error: GH_TOKEN or GITHUB_TOKEN environment variable is required"
  );
  process.exit(1);
}

const repo = "reactor-team/reactor-proto";
const assetName = `reactor-proto-${semver}.tgz`;
const outputDir = join(rootDir, "src", "generated");
const tempDir = join(rootDir, ".proto-temp");

console.log(
  `Fetching protobuf types version ${version} (tag: ${tag}, asset: ${assetName})...`
);

// Clean up any existing temp directory
if (existsSync(tempDir)) {
  rmSync(tempDir, { recursive: true });
}
mkdirSync(tempDir, { recursive: true });

// Clean up existing generated directory
if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true });
}
mkdirSync(outputDir, { recursive: true });

try {
  const tarballPath = join(tempDir, assetName);

  // For private repos, we need to:
  // 1. List releases to find one with exact tag match
  // 2. Get the asset ID
  // 3. Download using the asset API endpoint
  console.log(`Searching for release with tag ${tag}...`);

  const releasesJson = execSync(
    `curl -sL -H "Authorization: token ${ghToken}" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${repo}/releases"`,
    { encoding: "utf-8" }
  );

  const releases = JSON.parse(releasesJson);

  if (releases.message) {
    throw new Error(`GitHub API error: ${releases.message}`);
  }

  // Find a release with exact tag match
  const releaseInfo = releases.find((r) => r.tag_name === tag);

  if (!releaseInfo) {
    const availableTags = releases.map((r) => r.tag_name).slice(0, 10);
    console.error("Available releases:", availableTags);
    throw new Error(`No release found with tag ${tag}`);
  }

  console.log(`Found release: ${releaseInfo.tag_name}`);

  const asset = releaseInfo.assets?.find((a) => a.name === assetName);

  if (!asset) {
    console.error(
      "Available assets:",
      releaseInfo.assets?.map((a) => a.name)
    );
    throw new Error(
      `Asset ${assetName} not found in release ${releaseInfo.tag_name}`
    );
  }

  console.log(`Downloading asset ${assetName} (id: ${asset.id})...`);

  execSync(
    `curl -sL -H "Authorization: token ${ghToken}" -H "Accept: application/octet-stream" -o "${tarballPath}" "https://api.github.com/repos/${repo}/releases/assets/${asset.id}"`,
    { stdio: "inherit" }
  );

  // Extract the tarball
  console.log(`Extracting to ${outputDir}...`);
  execSync(`tar -xzf "${tarballPath}" -C "${tempDir}"`, { stdio: "inherit" });

  // Move the extracted TypeScript files to the output directory
  // The tarball typically extracts to a 'package' directory
  const extractedDir = join(tempDir, "package");

  if (existsSync(extractedDir)) {
    // Copy contents from extracted package to generated dir
    execSync(`cp -r "${extractedDir}"/* "${outputDir}"/`, { stdio: "inherit" });
  } else {
    // If no 'package' directory, copy everything from temp
    execSync(`cp -r "${tempDir}"/* "${outputDir}"/`, { stdio: "inherit" });
  }

  console.log(
    `✓ Protobuf types ${releaseInfo.tag_name} installed to src/generated`
  );
} catch (error) {
  console.error("Error fetching protobuf types:", error.message);
  process.exit(1);
} finally {
  // Clean up temp directory
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true });
  }
}
