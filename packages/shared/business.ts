export const presets = {
  restaurant: ['inventory', 'tables', 'kitchen', 'modifiers'],
  cafe: ['inventory', 'kitchen', 'modifiers'],
  bookshop: ['inventory', 'barcode'],
  retail: ['inventory', 'barcode', 'variants', 'customers', 'suppliers'],
  grocery: ['inventory', 'barcode', 'weighted', 'suppliers'],
  supermarket: ['inventory', 'barcode', 'weighted', 'suppliers'],
  bakery: ['inventory', 'modifiers'],
  custom: ['inventory'],
} as const;
export const modules = ['inventory', 'barcode', 'weighted', 'customers', 'suppliers', 'tables', 'kitchen', 'modifiers', 'variants'] as const;
export const metadataFields: Record<string, string[]> = {
  bookshop: ['isbn', 'author', 'publisher', 'genre', 'edition', 'publicationYear'],
  grocery: ['unit', 'batch', 'expiresOn'],
  supermarket: ['unit', 'batch', 'expiresOn'],
  retail: ['brand'],
};

