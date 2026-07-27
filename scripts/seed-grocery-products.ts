// Imports the supplied grocery price list into the Product collection.
//
// Existing products are matched by uppercase name and have their category and
// prices updated. Missing products are created with zero stock.
//
// Usage:
//   npm run seed:grocery-products
//   npx tsx scripts/seed-grocery-products.ts --confirm --category=GROCERY

import dotenv from "dotenv";
import path from "node:path";
import mongoose from "mongoose";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

type GroceryProductSeed = {
  name: string;
  buyingPrice: number;
  sellingPrice: number;
};

const PRICE_LIST = `
12X18|103.00|113.00
1ST CLASS FLOUR PINOY TASTY|43.00|47.00
3X8X06 CUTTY SARK|13.00|15.00
7UP 1.5L|59.00|65.00
7UP 750ML|23.00|25.00
AJI CHICKEN 100G|48.68|53.00
AJI CHICKEN POWDER 1KG|465.00|512.00
AJINOMOTO RED 100G|29.00|34.00
AJINOMOTO UMAMI 50G|15.00|17.00
AMOY RICE|1200.00|1300.00
APPLE TEA 200G|160.00|165.00
ASUETE 250G|41.00|45.00
ASUETE POWDER|150.00|165.00
ATHENA SANDO BAG TINY TRANSPARENT|20.00|23.00
BANAY-BANAY|950.00|1000.00
BARETA BLUE BAR|23.00|25.00
BARETA CALAMANSI|23.00|28.00
BARETA FABCON|27.00|30.00
BARETA WHITE DETERGENT|24.00|26.00
BATANG PINOY SANDO BAG TINY|25.00|28.00
BIO TEXAS MEDIUM|72.00|79.00
BISMARCK|15.00|17.00
BLEND GLOVES BLACK (PERBOX)|170.00|176.00
C-SKIN|20.00|50.00
C10|0.00|7.54
C2 335ML|26.00|30.00
C2 SOLO 230ML|13.00|15.00
C65|20.00|28.00
C99|45.00|47.00
CALAMANSI|35.00|38.00
CALYPSO 3X8|12.00|14.00
CALYPSO FISH BAG YELLOW|16.00|18.00
CHAMPION BAR|25.00|28.00
CHICKEN CUBES|7.00|10.00
CHILI FLAKES|230.00|253.00
CHILI GARLIC SMALL|7.00|8.00
CHILI POWDER BOTTLE|150.00|160.00
CHLORINE KG|114.00|125.00
CLEAN H2O 1000 ML WATER|17.00|19.00
COBRA 240ML|13.00|15.00
COKE 1L PER PIECE|33.33|37.00
CROPS|200.00|220.00
CURRY POWDER|595.00|600.00
DAHON|10.00|11.00
DENVER DRINKING WATER|17.00|20.00
DOVE MEDIUM|56.00|60.00
DOVE TINY|25.00|28.00
FEMME PAPER TOWEL 175PULL|65.00|66.00
FISH BAG|200.00|220.00
FISH BAG GREEN|13.80|15.00
FISH BAG PR PIECE|13.80|18.00
FISH BAG PR RM|255.00|280.50
FISH SAUCE 150ML|33.00|35.00
FLAGSHIP FLOUR 1KG|38.80|40.00
FLAGSHIP HARINA PR KILO 25KG|38.80|40.00
FLYING DRAGON FISH BAG|255.00|280.00
FOIL TRAY #5 MEDIUM|34.00|37.00
FOIL TRAY #6 LARGE|42.00|45.00
GARLIC POWDER 250G|62.00|68.00
GLOVES BLACK 100PCS|180.00|185.00
GLOVES BLUE100PCS|252.00|277.00
GOOD WIFE SCOURING PAD|15.00|17.00
HAND GLOVES TRANSPARENT|19.00|23.00
HARINA FLAGSHIP 1ST CLASS 25KG|940.00|990.00
HARINA FLAGSHIP WMIX|990.00|1250.00
HARINA MIX (FOR DELIVERY PRICE)|0.00|1350.00
HARINA MIX 1KG|450.00|495.00
HARINA W/ MIX (FOR PICK UP)|0.00|1300.00
HINGED CUP50PCS|67.60|74.00
HORSE SHOE SANDO BAG TINY|18.00|19.00
HUMABON PER 1KL|38.00|40.00
HUMABON WHEAT FLOUR 25KG|940.00|990.00
HYCO GARLIC POWER|490.00|539.00
IDOL RICE 25KG|890.00|990.00
INTENSE BLUE LEMONADE|140.00|154.00
INTENSE GRAPES|130.00|143.00
INTENSE LEMON|145.00|150.00
ISOL|10.00|30.00
JOY DISH PASTE LEMON|37.00|40.00
KING MA|120.00|132.00
KNOR BEEF CUBES|8.00|10.00
KOHAKU YELLOW SACK|59.00|65.00
LUCKY STAR SUNDAE SPOON|10.00|12.00
MACARONI SALAD|40.00|45.00
MAFRAN 3.5ML|125.00|137.00
MAFRAN GALON|127.00|140.00
MARINATE BUTTERED|370.00|375.00
MARINATE BUTTERED WALK IN|370.00|600.00
MARINATE LETSON|550.00|660.00
MD 1L|41.00|45.00
MDEW 1.5L|60.00|65.00
MDEW 290ML|16.33|18.00
MDEW 750ML|23.00|25.00
MDEW 8OZ|8.16|10.00
MIHONG VITSEN PR KILO|75.00|83.00
MILKIS|20.00|23.00
MINERAL WATER 1L|17.00|20.00
MINERAL WATER 500ML|11.00|13.00
MINI PER RIM TEXAS|30.00|33.00
MISC CLINGWRAP|28.00|31.00
`;

function parsePriceList(): GroceryProductSeed[] {
  const seen = new Set<string>();

  return PRICE_LIST.trim()
    .split(/\r?\n/)
    .map((line, index) => {
      const [rawName, rawBuyingPrice, rawSellingPrice, ...extra] = line.split("|");
      const name = String(rawName || "").trim().toUpperCase();
      const buyingPrice = Number(rawBuyingPrice);
      const sellingPrice = Number(rawSellingPrice);

      if (
        !name ||
        extra.length > 0 ||
        !Number.isFinite(buyingPrice) ||
        buyingPrice < 0 ||
        !Number.isFinite(sellingPrice) ||
        sellingPrice < 0
      ) {
        throw new Error(`Invalid grocery price-list row ${index + 1}: ${line}`);
      }
      if (seen.has(name)) {
        throw new Error(`Duplicate grocery product name: ${name}`);
      }

      seen.add(name);
      return { name, buyingPrice, sellingPrice };
    });
}

async function main() {
  if (!process.argv.includes("--confirm")) {
    throw new Error(
      "Refusing to import without --confirm. Usage: npm run seed:grocery-products"
    );
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured.");

  const categoryArgument = process.argv.find((argument) =>
    argument.startsWith("--category=")
  );
  const categoryName = String(categoryArgument?.slice("--category=".length) || "GROCERY")
    .trim()
    .toUpperCase();
  if (!categoryName) throw new Error("Category name cannot be empty.");

  const products = parsePriceList();

  await mongoose.connect(uri);
  const { default: CategoryModel } = await import("../models/Category");
  const { default: ProductModel } = await import("../models/Product");

  const category = await CategoryModel.findOneAndUpdate(
    { name: categoryName },
    {
      $set: { isActive: true },
      $setOnInsert: {
        name: categoryName,
        description: "GROCERY PRODUCTS",
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const result = await ProductModel.bulkWrite(
    products.map((product) => ({
      updateOne: {
        filter: { name: product.name },
        update: {
          $set: {
            categoryId: category._id,
            buyingPrice: product.buyingPrice,
            unitPrice: product.sellingPrice,
            isActive: true,
          },
          $setOnInsert: {
            name: product.name,
            stockPcs: 0,
            stockBags: 0,
            stockKilos: 0,
            lowStockAlert: 0,
          },
        },
        upsert: true,
      },
    })),
    { ordered: true }
  );

  console.log(`Database: ${mongoose.connection.db?.databaseName || "unknown"}`);
  console.log(`Category: ${category.name}`);
  console.log(`Price-list rows: ${products.length}`);
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
