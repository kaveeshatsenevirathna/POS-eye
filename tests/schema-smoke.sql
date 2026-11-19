-- Run on a disposable database after applying the initial migration.
BEGIN;
INSERT INTO "Business" ("id", "name", "type", "currency", "timezone") VALUES
 ('00000000-0000-4000-8000-000000000001', 'First shop', 'retail', 'USD', 'UTC'),
 ('00000000-0000-4000-8000-000000000002', 'Second shop', 'retail', 'USD', 'UTC');
INSERT INTO "Category" ("id", "businessId", "name") VALUES
 ('00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'General');
DO $$
DECLARE
  tenant uuid := '00000000-0000-4000-8000-000000000001';
  other_category uuid := '00000000-0000-4000-8000-000000000003';
  item uuid := '00000000-0000-4000-8000-000000000004';
  sale uuid := '00000000-0000-4000-8000-000000000005';
  cashier uuid := '00000000-0000-4000-8000-000000000006';
  request_key uuid := '00000000-0000-4000-8000-000000000007';
  table_id uuid := '00000000-0000-4000-8000-000000000008';
  affected integer;
  historical_price numeric;
BEGIN
  BEGIN
    INSERT INTO "Product" ("id", "businessId", "name", "categoryId", "price", "metadata", "updatedAt")
      VALUES (item, tenant, 'Invalid category reference', other_category, 10.00, '{}', now());
    RAISE EXCEPTION 'Cross-tenant category was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
  INSERT INTO "Product" ("id", "businessId", "name", "price", "metadata", "updatedAt", "stock")
    VALUES (item, tenant, 'Sample item', 10.00, '{}', now(), 1);
  UPDATE "Product" SET "stock" = "stock" - 1 WHERE "id" = item AND "businessId" = tenant AND "stock" >= 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Available stock was not deducted'; END IF;
  UPDATE "Product" SET "stock" = "stock" - 1 WHERE "id" = item AND "businessId" = tenant AND "stock" >= 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Out-of-stock item was deducted'; END IF;
  INSERT INTO "Order" ("id", "businessId", "cashierId", "requestKey", "fingerprint", "currency", "receipt", "gross", "discount", "tax", "revenue", "total")
    VALUES (sale, tenant, cashier, request_key, 'smoke', 'USD', '{}', 10, 0, 1, 10, 11);
  BEGIN
    INSERT INTO "Order" ("id", "businessId", "cashierId", "requestKey", "fingerprint", "currency", "receipt", "gross", "discount", "tax", "revenue", "total")
      VALUES (gen_random_uuid(), tenant, cashier, request_key, 'retry', 'USD', '{}', 10, 0, 1, 10, 11);
    RAISE EXCEPTION 'Duplicate checkout key was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  INSERT INTO "OrderItem" ("id", "businessId", "orderId", "productId", "name", "price", "quantity", "stockDeducted")
    VALUES (gen_random_uuid(), tenant, sale, item, 'Sample item', 10, 1, true);
  UPDATE "Product" SET "price" = 20 WHERE "id" = item;
  SELECT "price" INTO STRICT historical_price FROM "OrderItem" WHERE "orderId" = sale;
  IF historical_price <> 10 THEN RAISE EXCEPTION 'Product edit altered the historical price'; END IF;
  INSERT INTO "RestaurantTable" ("id", "businessId", "name") VALUES (table_id, tenant, 'Window 1');
  INSERT INTO "KitchenTicket" ("id", "businessId", "tableId", "cashierId", "orderType", "instructions", "lines", "updatedAt")
    VALUES (gen_random_uuid(), tenant, table_id, cashier, 'DINE_IN', '', '[]', now());
  BEGIN
    INSERT INTO "KitchenTicket" ("id", "businessId", "tableId", "cashierId", "orderType", "instructions", "lines", "updatedAt")
      VALUES (gen_random_uuid(), tenant, table_id, cashier, 'DINE_IN', '', '[]', now());
    RAISE EXCEPTION 'Table accepted a second open ticket';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  UPDATE "KitchenTicket" SET "status" = 'PAID' WHERE "tableId" = table_id;
  INSERT INTO "KitchenTicket" ("id", "businessId", "tableId", "cashierId", "orderType", "instructions", "lines", "updatedAt")
    VALUES (gen_random_uuid(), tenant, table_id, cashier, 'DINE_IN', '', '[]', now());
END
$$;
ROLLBACK;

