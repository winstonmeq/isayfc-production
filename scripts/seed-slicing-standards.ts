// Imports slicing standards that reference existing Bodega Products by name.
//
// Usage:
//   npm run seed:slicing-standards
//
// The npm command supplies --confirm. Direct execution must include it:
//   npx tsx scripts/seed-slicing-standards.ts --confirm

import dotenv from "dotenv";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

type SlicingStandardSeed = {
  wholeChickenName: string;
  productName: string;
  standardPacking: number;
  minimumKilos: number;
  maximumKilos: number;
  standardSlice: number;
};

const STANDARD_LIST = `
OS1|C10|50|16.1|17.9|28
OS2|C10|50|18|19|31
OS3|C10|50|19.1|20.9|31
OS4|C10|50|21|23.9|36
OS5|C10|50|24|30|40
PS1|C99|8|10|11.9|4
PS2|C99|8|12|13.9|4
PS3|C65|16|14|14.9|8
PS4|C65|16|15|16|9
PS4|C10|50|15|16|24
OS1|C65|16|16.1|17.9|10
OS2|C65|16|18|19|11
PS3|C99|8|14|14.9|4
SQ|W-C|5|7|8.9|1
US|W-C|5|9|9.9|1
C1-OS|C10|50|18|19.9|24
C1-OS|C10|50|20|21.9|28
C1-OS|C10|50|22|23.9|31
C1-OS|C10|50|24|25.9|33
C1|C10|50|0|0|24
C2|C10|50|0|0|24
C1-PS|C99|8|14|17|4
C1-US|W-C|5|0|0|1
C1|C65|16|0|0|9
PS1|W-C|5|10|11.9|1
SQ|C99|8|7|8.9|2
US|C65|16|9|9.9|4
C1-PS|C10|50|0|0|20
C2-OS|C10|50|17|18|24
C2-OS|C10|50|17|18|28
C2-OS|C10|50|18|19|31
C2-OS|C10|50|19|20|33
`;

function parseStandards(): SlicingStandardSeed[] {
  const seen = new Set<string>();

  return STANDARD_LIST.trim()
    .split(/\r?\n/)
    .map((line, index) => {
      const columns = line.split("|");
      if (columns.length !== 6) {
        throw new Error(`Invalid slicing-standard row ${index + 1}: ${line}`);
      }

      const [rawWholeName, rawProductName, ...rawNumbers] = columns;
      const wholeChickenName = rawWholeName.trim().toUpperCase();
      const productName = rawProductName.trim().toUpperCase();
      const [
        standardPacking,
        minimumKilos,
        maximumKilos,
        standardSlice,
      ] = rawNumbers.map(Number);

      if (
        !wholeChickenName ||
        !productName ||
        !Number.isFinite(standardPacking) ||
        standardPacking <= 0 ||
        !Number.isFinite(minimumKilos) ||
        minimumKilos < 0 ||
        !Number.isFinite(maximumKilos) ||
        maximumKilos < minimumKilos ||
        !Number.isFinite(standardSlice) ||
        standardSlice <= 0
      ) {
        throw new Error(`Invalid slicing-standard row ${index + 1}: ${line}`);
      }

      const key = [
        wholeChickenName,
        productName,
        standardPacking,
        minimumKilos,
        maximumKilos,
        standardSlice,
      ].join("|");
      if (seen.has(key)) {
        throw new Error(`Duplicate slicing-standard row: ${line}`);
      }
      seen.add(key);

      return {
        wholeChickenName,
        productName,
        standardPacking,
        minimumKilos,
        maximumKilos,
        standardSlice,
      };
    });
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to import without --confirm. Usage: npm run seed:slicing-standards"
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  const standards = parseStandards();
  const requiredNames = [
    ...new Set(
      standards.flatMap((standard) => [
        standard.wholeChickenName,
        standard.productName,
      ])
    ),
  ];

  await mongoose.connect(uri);
  const { default: BodegaProductModel } = await import(
    "../models/BodegaProduct"
  );
  const { default: StandardPackingModel } = await import(
    "../models/StandardPacking"
  );

  const products = await BodegaProductModel.find({
    name: { $in: requiredNames },
    isActive: true,
  })
    .select("_id name")
    .lean();

  const productsByName = new Map<string, (typeof products)[number][]>();
  for (const product of products) {
    const name = String(product.name || "").trim().toUpperCase();
    productsByName.set(name, [...(productsByName.get(name) || []), product]);
  }

  const ambiguousNames = requiredNames.filter(
    (name) => (productsByName.get(name)?.length || 0) > 1
  );
  if (ambiguousNames.length > 0) {
    throw new Error(
      `Multiple active Bodega Products use these names: ${ambiguousNames
        .sort()
        .join(", ")}`
    );
  }

  const missingNames = requiredNames.filter(
    (name) => !productsByName.has(name)
  );
  if (missingNames.length > 0) {
    const createdProducts = await BodegaProductModel.create(
      missingNames.sort().map((name) => ({
        name,
        stockQty: 0,
        stockBags: 0,
        stockKilos: 0,
        stockHeads: 0,
        buyingPrice: 0,
        sellingPrice: 0,
        isActive: true,
      }))
    );

    for (const product of createdProducts) {
      productsByName.set(product.name, [product]);
    }
    console.log(
      `Created missing Bodega Products with zero stock/prices: ${missingNames.length}`
    );
  }

  const operations = standards.map((standard) => {
    const wholeChickenId = productsByName.get(standard.wholeChickenName)![0]._id;
    const productId = productsByName.get(standard.productName)![0]._id;
    const values = {
      wholeChickenId,
      productId,
      standardPacking: standard.standardPacking,
      minimumKilos: standard.minimumKilos,
      maximumKilos: standard.maximumKilos,
      standardSlice: standard.standardSlice,
    };

    return {
      updateOne: {
        filter: values,
        update: {
          $set: {
            isActive: true,
            chickenSizeType: standard.wholeChickenName,
          },
          $setOnInsert: values,
        },
        upsert: true,
      },
    };
  });

  const result = await StandardPackingModel.bulkWrite(operations, {
    ordered: true,
  });

  console.log(`Database: ${mongoose.connection.db?.databaseName || "unknown"}`);
  console.log(`Slicing-standard rows: ${standards.length}`);
  console.log(`Created: ${result.upsertedCount}`);
  console.log(`Existing matches: ${result.matchedCount}`);
  console.log(`Updated: ${result.modifiedCount}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
