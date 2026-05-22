/**
 * Environment detection
 */
export const IS_DEVELOPMENT = process.env.NODE_ENV === "development";
export const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const IS_TEST = process.env.NODE_ENV === "test";
export const IS_SERVER = typeof window === "undefined";
export const IS_CLIENT = !IS_SERVER;

/**
 * App configuration constants
 */
export const APP_NAME = "PlacementRanker";
export const APP_DESCRIPTION = "Your digital product marketplace";
export const APP_VERSION = "0.0.1";

/**
 * API endpoints
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Pagination defaults
 */
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

/**
 * File upload limits
 */
export const MAX_FILE_SIZE_MB = 100;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_FILE_TYPES = [
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    ...ALLOWED_IMAGE_TYPES,
];

/**
 * Currency configuration
 */
export const DEFAULT_CURRENCY = "USD";
export const CURRENCY_SYMBOL = "$";
