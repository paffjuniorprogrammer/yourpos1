import { getProductPurchaseHistory, getProductSaleHistory, getProductAggregates } from './src/services/productReportService';

async function run() {
  try {
    const pId = '4eeaa31c-ad98-4c3d-82d2-8b3356bc080b'; // random uuid
    console.log("Testing getProductSaleHistory...");
    await getProductSaleHistory(pId);
    console.log("Testing getProductPurchaseHistory...");
    await getProductPurchaseHistory(pId);
    console.log("Testing getProductAggregates...");
    await getProductAggregates(pId);
    console.log("All success?");
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
