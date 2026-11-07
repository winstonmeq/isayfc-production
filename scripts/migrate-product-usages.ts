import "dotenv/config";
import mongoose from "mongoose";
import { ProductUsage } from "../lib/product-usage";

// Categorization lookup by normalized item name (uppercase, single spaces trimmed)
const USAGE_MAPPING: Record<string, ProductUsage> = {
  // === RETAIL_RESALE (Sold directly as-is) ===
  "7UP 1.5L": "RETAIL_RESALE",
  "7UP 750ML": "RETAIL_RESALE",
  "C2 335ML": "RETAIL_RESALE",
  "C2 SOLO 230ML": "RETAIL_RESALE",
  "CALAMANSI JUICE": "RETAIL_RESALE",
  "CLEAN H2O 1000 ML WATER": "RETAIL_RESALE",
  "COBRA 240ML": "RETAIL_RESALE",
  "COKE 1L PER PIECE": "RETAIL_RESALE",
  "DENVER DRINKING WATER": "RETAIL_RESALE",
  "MD 1L": "RETAIL_RESALE",
  "MDEW 1.5L": "RETAIL_RESALE",
  "MDEW 290ML": "RETAIL_RESALE",
  "MDEW 750ML": "RETAIL_RESALE",
  "MDEW 8OZ": "RETAIL_RESALE",
  "MILKIS": "RETAIL_RESALE",
  "MINERAL WATER 1L": "RETAIL_RESALE",
  "MINERAL WATER 500ML": "RETAIL_RESALE",
  "PEPSI 1.5 LITER": "RETAIL_RESALE",
  "PEPSI 290 ML": "RETAIL_RESALE",
  "PEPSI 750 ML": "RETAIL_RESALE",
  "PEPSI 8OZ": "RETAIL_RESALE",
  "STING 290ML": "RETAIL_RESALE",

  // === SELLING_EXPENSE (Packaging, bags, takeout containers & cutlery) ===
  "12X18": "SELLING_EXPENSE",
  "3X8X06 CUTTY SARK": "SELLING_EXPENSE",
  "ATHENA SANDO BAG TINY TRANSPARENT": "SELLING_EXPENSE",
  "BATANG PINOY SANDO BAG TINY": "SELLING_EXPENSE",
  "BIO TEXAS LARGE": "SELLING_EXPENSE",
  "BIO TEXAS MEDIUM": "SELLING_EXPENSE",
  "CALYPSO 3X8": "SELLING_EXPENSE",
  "DOVE MEDIUM": "SELLING_EXPENSE",
  "DOVE TINY": "SELLING_EXPENSE",
  "FEMME PAPER TOWEL 175PULL": "SELLING_EXPENSE",
  "FISH BAG": "SELLING_EXPENSE",
  "FISH BAG GREEN": "SELLING_EXPENSE",
  "FISH BAG PR PIECE": "SELLING_EXPENSE",
  "FISH BAG PR RM": "SELLING_EXPENSE",
  "FLYING DRAGON FISH BAG": "SELLING_EXPENSE",
  "FOIL TRAY #5 MEDIUM": "SELLING_EXPENSE",
  "FOIL TRAY #6 LARGE": "SELLING_EXPENSE",
  "HD BULLDOG ROLL BAG": "SELLING_EXPENSE",
  "HINGED CUP50PCS": "SELLING_EXPENSE",
  "HORSE SHOE SANDO BAG TINY": "SELLING_EXPENSE",
  "LUCKY STAR SUNDAE SPOON": "SELLING_EXPENSE",
  "MISC CLINGWRAP": "SELLING_EXPENSE",
  "MORE QUALITY SANDO BAG (MINI)": "SELLING_EXPENSE",
  "MORE QUALITY SANDO BAG (TINY)": "SELLING_EXPENSE",
  "PLASTIC SPOON": "SELLING_EXPENSE",
  "SAUCE CUP": "SELLING_EXPENSE",
  "SNOWBEAR ROLL BAG": "SELLING_EXPENSE",
  "STYRO PER PIECE": "SELLING_EXPENSE",
  "SUPOT #1": "SELLING_EXPENSE",
  "SUPOT #2": "SELLING_EXPENSE",
  "SUPOT #5": "SELLING_EXPENSE",
  "SUPOT #8": "SELLING_EXPENSE",
  "TEXAS MINI": "SELLING_EXPENSE",
  "TEXAS TINY": "SELLING_EXPENSE",
  "TISSUE BIG": "SELLING_EXPENSE",
  "TISSUE SMALL": "SELLING_EXPENSE",
  "TOOTHPICK": "SELLING_EXPENSE",
  "ZIPLOCK CHICKEN POUCH": "SELLING_EXPENSE",

  // === OPERATING_EXPENSE (Cleaning, dishwashing, sanitation & store maintenance) ===
  "BARETA BAR": "OPERATING_EXPENSE",
  "BARETA CALAMANSI": "OPERATING_EXPENSE",
  "BARETA FABCON": "OPERATING_EXPENSE",
  "BARETA WHITE DETERGENT": "OPERATING_EXPENSE",
  "CHAMPION BAR": "OPERATING_EXPENSE",
  "CHLORINE KG": "OPERATING_EXPENSE",
  "GOOD WIFE SCOURING PAD": "OPERATING_EXPENSE",
  "JOY DISH PASTE LEMON": "OPERATING_EXPENSE",
  "SABON DE ORO": "OPERATING_EXPENSE",
  "SPEED BAR": "OPERATING_EXPENSE",
  "SPONGE": "OPERATING_EXPENSE",
  "STEEL WOOL": "OPERATING_EXPENSE",
  "VERY GOOD DISWASHING LIQUID": "OPERATING_EXPENSE",
  "WINGS POWDER": "OPERATING_EXPENSE",
  "ZONROX 1L": "OPERATING_EXPENSE",

  // === PRODUCTION_OVERHEAD (Cooking fuels & PPE) ===
  "BLACK GLOVES RUBBER (PERBOX)": "PRODUCTION_OVERHEAD",
  "GLOVES BLACK 100PCS": "PRODUCTION_OVERHEAD",
  "GLOVES BLUE100PCS": "PRODUCTION_OVERHEAD",
  "HAND GLOVES TRANSPARENT": "PRODUCTION_OVERHEAD",
  "PHOENIX 11KG": "PRODUCTION_OVERHEAD",
  "PRYCE GAS 50KG": "PRODUCTION_OVERHEAD",
  "SOLANE 11KG": "PRODUCTION_OVERHEAD",
  "ULING (IPIL)": "PRODUCTION_OVERHEAD",

  // === PRODUCTION_COST (Ingredients, flours, seasonings, rice & food parts) ===
  "1ST CLASS FLOUR PINOY TASTY": "PRODUCTION_COST",
  "AJI CHICKEN 100G": "PRODUCTION_COST",
  "AJI CHICKEN POWDER 1KG": "PRODUCTION_COST",
  "AJINOMOTO RED 100G": "PRODUCTION_COST",
  "AJINOMOTO UMAMI 50G": "PRODUCTION_COST",
  "AMOY RICE": "PRODUCTION_COST",
  "APPLE TEA 200G": "PRODUCTION_COST",
  "ASUETE 250G": "PRODUCTION_COST",
  "ASUETE POWDER": "PRODUCTION_COST",
  "BANAY-BANAY": "PRODUCTION_COST",
  "C-SKIN": "PRODUCTION_COST",
  "C10": "PRODUCTION_COST",
  "C65": "PRODUCTION_COST",
  "C99": "PRODUCTION_COST",
  "CALAMANSI": "PRODUCTION_COST",
  "CHILI FLAKES": "PRODUCTION_COST",
  "CHILI GARLIC SMALL": "PRODUCTION_COST",
  "CHILI POWDER BOTTLE": "PRODUCTION_COST",
  "CROPS": "PRODUCTION_COST",
  "CURRY POWDER": "PRODUCTION_COST",
  "DAHON": "PRODUCTION_COST",
  "FISH SAUCE 150ML": "PRODUCTION_COST",
  "FLAGSHIP FLOUR 1KG": "PRODUCTION_COST",
  "FLAGSHIP HARINA PR KILO 25KG": "PRODUCTION_COST",
  "GARLIC POWDER 250G": "PRODUCTION_COST",
  "HARINA FLAGSHIP 1ST CLASS 25KG": "PRODUCTION_COST",
  "HARINA FLAGSHIP WMIX": "PRODUCTION_COST",
  "HARINA MIX": "PRODUCTION_COST",
  "HARINA MIX (FOR DELIVERY PRICE)": "PRODUCTION_COST",
  "HARINA W/ MIX (FOR PICK UP)": "PRODUCTION_COST",
  "HUMABON PER 1KL": "PRODUCTION_COST",
  "HUMABON WHEAT FLOUR 25KG": "PRODUCTION_COST",
  "HYCO GARLIC POWER": "PRODUCTION_COST",
  "IDOL RICE 25KG": "PRODUCTION_COST",
  "INTENSE BLUE LEMONADE": "PRODUCTION_COST",
  "INTENSE GRAPES": "PRODUCTION_COST",
  "INTENSE LEMON": "PRODUCTION_COST",
  "ISOL": "PRODUCTION_COST",
  "KING MA": "PRODUCTION_COST",
  "KNOR BEEF CUBES": "PRODUCTION_COST",
  "KOHAKU RICE": "PRODUCTION_COST",
  "MACARONI SALAD": "PRODUCTION_COST",
  "MAFRAN 3.5ML": "PRODUCTION_COST",
  "MAFRAN GALON": "PRODUCTION_COST",
  "MARINATE BUTTERED": "PRODUCTION_COST",
  "MARINATE BUTTERED WALK IN": "PRODUCTION_COST",
  "MARINATE LETSON": "PRODUCTION_COST",
  "MIHONG VITSEN PR KILO": "PRODUCTION_COST",
  "MILAGROSA RICE PER KILO": "PRODUCTION_COST",
  "MIXLETSON": "PRODUCTION_COST",
  "PALM OIL GALON": "PRODUCTION_COST",
  "PINOY PALAMIG POWDER MIX": "PRODUCTION_COST",
  "SINAMAK SMALL": "PRODUCTION_COST",
  "TANGLAD": "PRODUCTION_COST",
  "TITA FRITA BANANA KETCHUP": "PRODUCTION_COST",
  "TOYO GALON": "PRODUCTION_COST",
};

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

async function main() {
  const isApply = process.argv.includes("--confirm");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not found.");

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) throw new Error("Failed to connect to DB");

  console.log(`Connected to database: ${db.databaseName}`);
  console.log(`Mode: ${isApply ? "APPLY (writing changes)" : "DRY-RUN (preview only, add --confirm to write)"}`);

  const products = await db.collection("products").find({}).toArray();
  console.log(`\nFound ${products.length} grocery products.`);

  let updatedProductsCount = 0;
  let unmappedCount = 0;
  const summary: Record<string, number> = {};

  for (const product of products) {
    const normalized = normalizeName(product.name);
    const assignedUsage = USAGE_MAPPING[normalized];

    if (!assignedUsage) {
      console.warn(`[WARNING] No mapping found for product: "${product.name}" (normalized: "${normalized}")`);
      unmappedCount++;
      continue;
    }

    summary[assignedUsage] = (summary[assignedUsage] || 0) + 1;

    if (product.usage !== assignedUsage) {
      updatedProductsCount++;
      if (isApply) {
        await db.collection("products").updateOne(
          { _id: product._id },
          { $set: { usage: assignedUsage } }
        );
      }
    }
  }

  // Also update Bodega Products to PRODUCTION_COST if unassigned
  const bodegaProducts = await db.collection("bodegaproducts").find({}).toArray();
  console.log(`\nFound ${bodegaProducts.length} bodega products.`);
  let updatedBodegaCount = 0;
  for (const bp of bodegaProducts) {
    if (bp.usage !== "PRODUCTION_COST") {
      updatedBodegaCount++;
      if (isApply) {
        await db.collection("bodegaproducts").updateOne(
          { _id: bp._id },
          { $set: { usage: "PRODUCTION_COST" } }
        );
      }
    }
  }

  console.log("\n--- Migration Preview / Results ---");
  console.log(`Grocery products to update: ${updatedProductsCount} / ${products.length}`);
  console.log(`Bodega products to update: ${updatedBodegaCount} / ${bodegaProducts.length}`);
  console.log(`Unmapped products: ${unmappedCount}`);
  console.log("\nAssigned Breakdown for Grocery Products:");
  for (const [usage, count] of Object.entries(summary)) {
    console.log(`  ${usage}: ${count}`);
  }

  if (!isApply) {
    console.log("\nDry-run completed successfully. Run with '--confirm' to apply.");
  } else {
    console.log("\nChanges successfully written to MongoDB!");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

