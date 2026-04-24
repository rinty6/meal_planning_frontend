/**
 * BARCODE API SERVICE
 *
 * This file handles all API calls to Open Food Facts database.
 * It allows users to scan food barcodes and retrieve nutritional information.
 *
 * Used by: addfoodmodal.tsx (barcode scanning feature)
 */

// ============================================
// STEP 1: Define the response structure from Open Food Facts API
// ============================================

interface NutrimentData {
  energy_kcal?: number;
  energy_kcal_100g?: number;
  proteins?: number;
  proteins_100g?: number;
  carbohydrates?: number;
  carbohydrates_100g?: number;
  fat?: number;
  fat_100g?: number;
  [key: string]: any; // Allow other fields
}

interface OpenFoodFactsProduct {
  code: string;
  product_name: string;
  nutrition_grades?: string;
  nutriments?: NutrimentData;
  images?: {
    [key: string]: {
      sizes?: {
        [key: string]: {
          w: number;
          h: number;
        };
      };
      rev?: string;
      [key: string]: any;
    };
  };
  [key: string]: any;
}

interface BarcodeResponse {
  success: boolean;
  data?: {
    foodName: string;
    barcode: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    image: string | null;
  };
  error?: string;
}

// ============================================
// STEP 2: Construct image URL from barcode and product data
// ============================================

/**
 * Generates the product image URL from Open Food Facts based on barcode
 * Following their image URL construction rules:
 * - Split barcode into folders: first 9 digits split into 3 groups of 3, rest in last group
 * - For product image selection, use the front_en (or fallback to first available)
 */
function constructImageUrl(barcode: string, productData: OpenFoodFactsProduct): string | null {
  try {
    // Pad barcode with leading zeros if less than 13 digits
    const paddedBarcode = barcode.padStart(13, '0');

    // Extract the first 9 digits and split into 3 groups of 3, then add the rest
    const match = paddedBarcode.match(/^(...)(...)(...)(.*)$/);
    if (!match) return null;

    const [, group1, group2, group3, rest] = match;
    const folderPath = `${group1}/${group2}/${group3}/${rest}`;

    // Check if product has images
    if (!productData.images) return null;

    // Priority: front_en (English front), then any front_xx, then fall back to first numeric image
    let imageKey: string | null = null;

    if ('front_en' in productData.images) {
      imageKey = 'front_en';
    } else {
      // Try to find any front image
      const frontKeys = Object.keys(productData.images).filter(k => k.startsWith('front_'));
      if (frontKeys.length > 0) {
        imageKey = frontKeys[0];
      } else {
        // Fall back to first numeric image (raw upload)
        const numericKeys = Object.keys(productData.images).filter(k => /^\d+$/.test(k));
        if (numericKeys.length > 0) {
          imageKey = numericKeys[0];
        }
      }
    }

    if (!imageKey) return null;

    const imageData = productData.images[imageKey];
    const baseUrl = 'https://images.openfoodfacts.org/images/products';

    // Construct filename based on image type
    let filename = '';
    if (/^\d+$/.test(imageKey)) {
      // Raw image: just the numeric ID + .jpg
      filename = `${imageKey}.jpg`;
    } else {
      // Selected image: image_name.rev.resolution.jpg
      const rev = imageData.rev || '1';
      filename = `${imageKey}.${rev}.400.jpg`; // Use 400px resolution
    }

    return `${baseUrl}/${folderPath}/${filename}`;
  } catch (error) {
    console.error('Error constructing image URL:', error);
    return null;
  }
}

// ============================================
// STEP 3: Extract nutritional information from product data
// ============================================

/**
 * Extracts nutritional values from Open Food Facts product data
 * Values are calculated per 100g to normalize portion sizes
 */
function extractNutritionData(
  productData: OpenFoodFactsProduct
): {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
} {
  const nutriments = productData.nutriments || {};

  // Extract per 100g values (more standardized across products)
  const protein = Math.round((nutriments.proteins_100g || nutriments.proteins || 0) * 10) / 10;
  const carbs = Math.round((nutriments.carbohydrates_100g || nutriments.carbohydrates || 0) * 10) / 10;
  const fats = Math.round((nutriments.fat_100g || nutriments.fat || 0) * 10) / 10;
  
  let calories = Math.round(nutriments.energy_kcal_100g || nutriments.energy_kcal || 0);

  // 🛠️ FIX: Calculate calories manually using 4-4-9 if the database is missing them
  if (calories === 0 && (protein > 0 || carbs > 0 || fats > 0)) {
    calories = Math.round((fats * 9) + (protein * 4) + (carbs * 4));
    console.log(`🧮 [BARCODE API] Calories were 0. Calculated manually: ${calories} kcal`);
  }

  return { calories, protein, carbs, fats };
}

// ============================================
// STEP 4: Fetch barcode data from Open Food Facts API
// ============================================

/**
 * Main function to fetch product data from Open Food Facts by barcode
 *
 * @param barcode - The product barcode to scan
 * @returns Promise<BarcodeResponse> - Contains success status and food data
 */
export async function fetchBarcodeData(barcode: string): Promise<BarcodeResponse> {
  try {
    console.log(`🔍 [BARCODE API] Fetching product data for barcode: ${barcode}`);

    // Validate barcode
    if (!barcode || barcode.trim() === '') {
      return {
        success: false,
        error: 'Invalid barcode: barcode cannot be empty',
      };
    }

    // Construct API URL with specific fields we need
    const apiUrl = `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,nutriments,nutrition_grades,images`;

    // ============================================
    // IMPORTANT: Set User-Agent header as required by Open Food Facts API
    // ============================================
    const headers = {
      'User-Agent': 'meal_app/1.0 (duongphuthinh2001@gmail.com)',
      'Accept': 'application/json',
    };

    // Fetch product data from Open Food Facts
    const response = await fetch(apiUrl, { headers });

    console.log(`📡 [BARCODE API] API Response Status: ${response.status}`);

    // Check if response is ok (status 200-299)
    if (!response.ok) {
      return {
        success: false,
        error: `API Error: ${response.status} - Product not found in Open Food Facts database`,
      };
    }

    const responseData = await response.json();
    console.log(`✅ [BARCODE API] Response received:`, responseData);

    // Check if product exists in response
    if (responseData.status === 0 || !responseData.product) {
      return {
        success: false,
        error: 'Product not found in Open Food Facts database',
      };
    }

    const product: OpenFoodFactsProduct = responseData.product;

    // ============================================
    // STEP 5: Extract required data
    // ============================================

    // Get food name
    const foodName = product.product_name || `Unknown (${barcode})`;
    console.log(`📝 [BARCODE API] Food Name: ${foodName}`);

    // Extract nutritional information
    const nutritionData = extractNutritionData(product);
    console.log(`📊 [BARCODE API] Nutrition Data:`, nutritionData);

    // Construct image URL
    const imageUrl = constructImageUrl(barcode, product);
    console.log(`🖼️ [BARCODE API] Image URL: ${imageUrl || 'No image found'}`);

    // ============================================
    // STEP 6: Return formatted response
    // ============================================

    return {
      success: true,
      data: {
        foodName,
        barcode,
        calories: nutritionData.calories,
        protein: nutritionData.protein,
        carbs: nutritionData.carbs,
        fats: nutritionData.fats,
        image: imageUrl,
      },
    };
  } catch (error) {
    console.error('[BARCODE API] Error fetching barcode data:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

// ============================================
// STEP 7: Additional utility function for testing
// ============================================

export async function testBarcodeAPI(testBarcode: string = '3017624010701'): Promise<void> {
  console.log(`🧪 [BARCODE API] Testing with barcode: ${testBarcode}`);
  const result = await fetchBarcodeData(testBarcode);
  console.log(`🧪 [BARCODE API] Test Result:`, result);
}