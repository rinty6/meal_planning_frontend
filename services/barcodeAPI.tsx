/**
 * Barcode API service.
 *
 * Looks up scanned packaged-food barcodes in Open Food Facts and converts the
 * response into the shape consumed by AddFoodModal.
 */

interface NutrimentData {
  energy_kcal?: number;
  energy_kcal_100g?: number;
  proteins?: number;
  proteins_100g?: number;
  carbohydrates?: number;
  carbohydrates_100g?: number;
  fat?: number;
  fat_100g?: number;
  [key: string]: any;
}

interface OpenFoodFactsProduct {
  code: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
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

function normalizeBarcode(barcode: string): string {
  return String(barcode || '').trim();
}

/**
 * Generates a product image URL from Open Food Facts image metadata.
 */
function constructImageUrl(barcode: string, productData: OpenFoodFactsProduct): string | null {
  try {
    const paddedBarcode = barcode.padStart(13, '0');
    const match = paddedBarcode.match(/^(...)(...)(...)(.*)$/);
    if (!match) return null;

    const [, group1, group2, group3, rest] = match;
    const folderPath = `${group1}/${group2}/${group3}/${rest}`;
    if (!productData.images) return null;

    let imageKey: string | null = null;

    if ('front_en' in productData.images) {
      imageKey = 'front_en';
    } else {
      const frontKeys = Object.keys(productData.images).filter((key) => key.startsWith('front_'));
      if (frontKeys.length > 0) {
        imageKey = frontKeys[0];
      } else {
        const numericKeys = Object.keys(productData.images).filter((key) => /^\d+$/.test(key));
        if (numericKeys.length > 0) imageKey = numericKeys[0];
      }
    }

    if (!imageKey) return null;

    const imageData = productData.images[imageKey];
    const baseUrl = 'https://images.openfoodfacts.org/images/products';
    const filename = /^\d+$/.test(imageKey)
      ? `${imageKey}.jpg`
      : `${imageKey}.${imageData.rev || '1'}.400.jpg`;

    return `${baseUrl}/${folderPath}/${filename}`;
  } catch (error) {
    console.error('[BARCODE API] Error constructing image URL:', error);
    return null;
  }
}

/**
 * Extracts nutrition values per 100 g.
 */
function extractNutritionData(productData: OpenFoodFactsProduct): {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
} {
  const nutriments = productData.nutriments || {};
  const protein = Math.round((nutriments.proteins_100g || nutriments.proteins || 0) * 10) / 10;
  const carbs = Math.round((nutriments.carbohydrates_100g || nutriments.carbohydrates || 0) * 10) / 10;
  const fats = Math.round((nutriments.fat_100g || nutriments.fat || 0) * 10) / 10;
  let calories = Math.round(nutriments.energy_kcal_100g || nutriments.energy_kcal || 0);

  if (calories === 0 && (protein > 0 || carbs > 0 || fats > 0)) {
    calories = Math.round((fats * 9) + (protein * 4) + (carbs * 4));
    console.log(`[BARCODE API] Calories were missing. Calculated manually: ${calories} kcal`);
  }

  return { calories, protein, carbs, fats };
}

export async function fetchBarcodeData(barcode: string): Promise<BarcodeResponse> {
  try {
    const normalizedBarcode = normalizeBarcode(barcode);
    console.log(`[BARCODE API] Fetching product data for barcode: ${normalizedBarcode}`);

    if (!normalizedBarcode) {
      return {
        success: false,
        error: 'Invalid barcode: barcode cannot be empty',
      };
    }

    const apiUrl =
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(normalizedBarcode)}` +
      '?fields=product_name,product_name_en,generic_name,nutriments,nutrition_grades,images';

    const headers = {
      'User-Agent': 'meal_app/1.0 (duongphuthinh2001@gmail.com)',
      Accept: 'application/json',
    };

    const response = await fetch(apiUrl, { headers });
    console.log(`[BARCODE API] API Response Status: ${response.status}`);

    if (!response.ok) {
      return {
        success: false,
        error: `API Error: ${response.status} - Product not found in Open Food Facts database`,
      };
    }

    const responseData = await response.json();
    console.log('[BARCODE API] Response received:', responseData);

    if (responseData.status === 0 || !responseData.product) {
      return {
        success: false,
        error: 'Product not found in Open Food Facts database',
      };
    }

    const product: OpenFoodFactsProduct = responseData.product;
    const foodName =
      product.product_name ||
      product.product_name_en ||
      product.generic_name ||
      `Unknown (${normalizedBarcode})`;

    const nutritionData = extractNutritionData(product);
    const imageUrl = constructImageUrl(normalizedBarcode, product);

    console.log(`[BARCODE API] Food Name: ${foodName}`);
    console.log('[BARCODE API] Nutrition Data:', nutritionData);
    console.log(`[BARCODE API] Image URL: ${imageUrl || 'No image found'}`);

    return {
      success: true,
      data: {
        foodName,
        barcode: normalizedBarcode,
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

export async function testBarcodeAPI(testBarcode: string = '3017624010701'): Promise<void> {
  console.log(`[BARCODE API] Testing with barcode: ${testBarcode}`);
  const result = await fetchBarcodeData(testBarcode);
  console.log('[BARCODE API] Test Result:', result);
}
