import { execSync } from "child_process";
import fs from "fs";

const args = process.argv.splice(2);
if (args.length !== 1) {
  console.log("Usage: node app.js <package.json path>");
  process.exit(1);
}

const filePath = args[0];
if (!fs.existsSync(filePath)) {
  console.log("File not found with given path");
  process.exit(1);
}

let dependencies = {};

try {
  const packageJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (packageJson.dependencies) {
    dependencies = { ...dependencies, ...packageJson.dependencies };
  }
  if (packageJson.devDependencies) {
    dependencies = { ...dependencies, ...packageJson.devDependencies };
  }
} catch (error) {
  console.log("Invalid JSON file");
  process.exit(1);
}

if (Object.keys(dependencies).length === 0) {
  console.log("* No dependency found");
  process.exit(1);
}

console.log();

let earliestPossibleDate = 0;
let latestPossibleDate = new Date(3376727114000); // INF
let dateRanges = [];

for (const [packageName, packageVersion] of Object.entries(dependencies)) {
  if (packageVersion === "latest") {
    console.log(`${packageName} * Skip as using latest`);
    continue;
  }
  const targetVersion = packageVersion.replace("^", "").replace("~", "");
  const output = execSync(`npm view ${packageName} time --json`);
  try {
    const parsedOutput = JSON.parse(output);
    const versions = Object.entries(parsedOutput)
      .map(([version, date]) => ({
        version,
        date: Date.parse(date),
      }))
      // ignore as is the same as first recorded version
      .filter((item) => item.version !== "created")
      // ignore pre-release versions
      .filter((item) => !item.version.includes("-"));
    // Maybe it does make more sense to sort by version code
    // but some packages skip back and forth between versions
    // e.g. express releases version 4.21.0 after 5.0.0
    // update: we're adding a "version up" check when looking for succeeding version
    const sortedVersions = versions.sort((a, b) => (a.date > b.date ? 1 : -1));
    let isFound = false;
    for (let i = 0; i < sortedVersions.length; i++) {
      const { version, date } = sortedVersions[i];
      if (version === targetVersion) {
        let nextDate;
        for (let j = i + 1; j < sortedVersions.length; j++) {
          if (compareSemver(sortedVersions[j].version, version) > 0) {
            nextDate = sortedVersions[j].date;
            break;
          }
        }
        const rangeEnd = nextDate ?? latestPossibleDate;
        dateRanges.push({ packageName, start: date, end: rangeEnd });
        console.log(
          `${packageName} | ${version} | ${formatDate(date)} -> ${formatDate(rangeEnd)}`
        );
        isFound = true;
        break;
      }
    }
    if (!isFound) {
      console.log(`${packageName} * Not found`);
    }
  } catch (error) {
    console.log("Invalid JSON output");
    process.exit(1);
  }
}

if (dateRanges.length > 0) {
  earliestPossibleDate = dateRanges.reduce(
    (current, range) => (current > range.start ? current : range.start),
    earliestPossibleDate
  );
  const validEnds = dateRanges
    .map((range) => range.end)
    .filter((end) => end >= earliestPossibleDate);
  if (validEnds.length > 0) {
    latestPossibleDate = validEnds.reduce(
      (current, end) => (current < end ? current : end),
      latestPossibleDate
    );
  }
}

const cyan = (text) => `\x1b[96m${text}\x1b[0m`;

console.log(
  `\n${"-".repeat(30)}\n\nAccording to dependency versions,\nThis package.json was last updated within the date range:\n\n~ ${cyan(
    formatDate(earliestPossibleDate)
  )} -> ${cyan(formatDate(latestPossibleDate))}\n`
);

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compareSemver(a, b) {
  return a
    .replace(/\d+/g, (n) => String(n).padStart(6, "0"))
    .localeCompare(b.replace(/\d+/g, (n) => String(n).padStart(6, "0")));
}
