import fs from "node:fs";
import path from "node:path";

type RootRecord = {
  ts: string;
  root: string;
  entries: number;
};

const rootsDir = path.resolve(process.cwd(), "roots");

function readRecords(): RootRecord[] {
  const files = fs
    .readdirSync(rootsDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort();

  const records: RootRecord[] = [];

  for (const file of files) {
    const lines = fs
      .readFileSync(path.join(rootsDir, file), "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const record = JSON.parse(line) as RootRecord;
      if (
        typeof record.ts !== "string" ||
        typeof record.root !== "string" ||
        !/^[0-9a-f]{64}$/i.test(record.root) ||
        !Number.isInteger(record.entries) ||
        record.entries < 0
      ) {
        throw new Error(`invalid root record in ${file}: ${line}`);
      }
      records.push(record);
    }
  }

  return records.sort((a, b) => a.ts.localeCompare(b.ts));
}

const records = readRecords();
const violations: string[] = [];

let maxEntries = -1;
const rootFirstEntries = new Map<string, number>();

for (const record of records) {
  if (record.entries < maxEntries) {
    violations.push(
      `length-decrease: ${record.ts} publishes entries=${record.entries}, ` +
        `but an earlier record already published entries=${maxEntries}`
    );
  }

  const firstEntries = rootFirstEntries.get(record.root);
  if (firstEntries !== undefined && record.entries > firstEntries) {
    violations.push(
      `root-rewind: ${record.ts} reuses root ${record.root} after entries ` +
        `grew from ${firstEntries} to ${record.entries}`
    );
  } else if (firstEntries === undefined) {
    rootFirstEntries.set(record.root, record.entries);
  }

  maxEntries = Math.max(maxEntries, record.entries);
}

if (violations.length > 0) {
  console.error(`chain verification failed: ${violations.length} violation(s)`);
  for (const violation of violations.slice(0, 20)) {
    console.error(violation);
  }
  process.exit(1);
}

console.log(`chain verification passed: ${records.length} records checked`);