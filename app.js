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

console.log()

let earliestPossibleDate = 0;
let latestPossibleDate = new Date(3376727114000); // INF

for (const [packageName, packageVersion] of Object.entries(dependencies)) {
  if (packageVersion === "latest") {
    console.log(`Skipping ${packageName} since it's using the latest version`);
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
      .filter((item) => item.version !== "created");
    const sortedVersions = versions.sort((a, b) =>
      a.version
        .replace(/\d+/g, (n) => +n + 100000)
        .localeCompare(b.version.replace(/\d+/g, (n) => +n + 100000))
    );
    let isFound = false;
    for (let i = 0; i < sortedVersions.length; i++) {
      const { version, date } = sortedVersions[i];
      if (version === targetVersion) {
        if (earliestPossibleDate < date) {
          console.log(
            `${packageName} ${version}\n  MIN ${formatDate(earliestPossibleDate)} -> ${formatDate(date)}`
          );
          earliestPossibleDate = date;
        }
        const nextDate = sortedVersions[i + 1]?.date;
        const nextVersion = sortedVersions[i + 1]?.version;
        if (nextDate && latestPossibleDate > nextDate) {
          console.log(
            `${packageName} ${nextVersion}\n  MAX ${formatDate(latestPossibleDate)} -> ${formatDate(nextDate)}`
          );
          latestPossibleDate = nextDate;
        }
        isFound = true;
        break;
      }
    }
    if (!isFound) {
      console.log(`No matching version found for ${packageName}`);
    }
  } catch (error) {
    console.log("Invalid JSON output");
    process.exit(1);
  }
}

console.log(
  `\n${"-".repeat(30)}\n\nEstimated date range:\n\n> ${formatDate(
    earliestPossibleDate
  )}\n< ${formatDate(latestPossibleDate)}\n`
);

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
