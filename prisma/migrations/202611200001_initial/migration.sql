CREATE TABLE "User" (
  "id" UUID NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "demo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLogin" TIMESTAMP(3)
);

CREATE TABLE "Session" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Business" (
  "id" UUID NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "demo" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "BusinessMembership" (
  "businessId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY ("businessId", "userId")
);

CREATE TABLE "BusinessSettings" (
  "businessId" UUID NOT NULL PRIMARY KEY,
  "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
  "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
  "allowOversell" BOOLEAN NOT NULL DEFAULT false,
  "allowManualCard" BOOLEAN NOT NULL DEFAULT false,
  "staffDiscountLimit" DECIMAL(6,3) NOT NULL DEFAULT 0,
  "accent" TEXT NOT NULL DEFAULT '#a6ef85',
  "receiptHeader" TEXT NOT NULL DEFAULT '',
  "receiptFooter" TEXT NOT NULL DEFAULT '',
  "receiptWidth" INTEGER NOT NULL DEFAULT 80,
  "address" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE "EnabledModule" (
  "businessId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  PRIMARY KEY ("businessId", "key")
);

CREATE TABLE "Category" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "name" TEXT NOT NULL
);

CREATE TABLE "Product" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "categoryId" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sku" TEXT,
  "barcode" TEXT,
  "image" TEXT,
  "price" DECIMAL(14,2) NOT NULL,
  "cost" DECIMAL(14,2),
  "stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "reorder" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "metadata" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "InventoryMovement" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "delta" DECIMAL(14,3) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Order" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "cashierId" UUID NOT NULL,
  "requestKey" UUID NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "receipt" JSONB NOT NULL,
  "gross" DECIMAL(16,2) NOT NULL,
  "discount" DECIMAL(16,2) NOT NULL,
  "tax" DECIMAL(16,2) NOT NULL,
  "revenue" DECIMAL(16,2) NOT NULL,
  "total" DECIMAL(16,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT,
  "price" DECIMAL(14,2) NOT NULL,
  "cost" DECIMAL(14,2),
  "quantity" DECIMAL(14,3) NOT NULL,
  "stockDeducted" BOOLEAN NOT NULL
);

CREATE TABLE "Payment" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "method" TEXT NOT NULL,
  "amount" DECIMAL(16,2) NOT NULL,
  "tendered" DECIMAL(16,2),
  "reference" TEXT
);

CREATE TABLE "Refund" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "restocked" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Expense" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditLog" (
  "id" UUID NOT NULL PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");

CREATE INDEX "Session_expiresAt_idx" ON "Session" ("expiresAt");

CREATE INDEX "BusinessMembership_userId_idx" ON "BusinessMembership" ("userId");

CREATE UNIQUE INDEX "Category_businessId_name_key" ON "Category" ("businessId", "name");

CREATE UNIQUE INDEX "Category_businessId_id_key" ON "Category" ("businessId", "id");

CREATE UNIQUE INDEX "Product_businessId_id_key" ON "Product" ("businessId", "id");

CREATE UNIQUE INDEX "Product_businessId_sku_key" ON "Product" ("businessId", "sku");

CREATE UNIQUE INDEX "Product_businessId_barcode_key" ON "Product" ("businessId", "barcode");

CREATE INDEX "InventoryMovement_businessId_productId_createdAt_idx" ON "InventoryMovement" ("businessId", "productId", "createdAt");

CREATE UNIQUE INDEX "Order_businessId_requestKey_key" ON "Order" ("businessId", "requestKey");

CREATE UNIQUE INDEX "Order_businessId_id_key" ON "Order" ("businessId", "id");

CREATE INDEX "Order_businessId_createdAt_idx" ON "Order" ("businessId", "createdAt");

CREATE INDEX "OrderItem_businessId_orderId_idx" ON "OrderItem" ("businessId", "orderId");

CREATE INDEX "Payment_businessId_orderId_idx" ON "Payment" ("businessId", "orderId");

CREATE UNIQUE INDEX "Refund_businessId_orderId_key" ON "Refund" ("businessId", "orderId");

CREATE INDEX "Refund_businessId_createdAt_idx" ON "Refund" ("businessId", "createdAt");

CREATE INDEX "Expense_businessId_createdAt_idx" ON "Expense" ("businessId", "createdAt");

CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog" ("businessId", "createdAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BusinessSettings" ADD CONSTRAINT "BusinessSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnabledModule" ADD CONSTRAINT "EnabledModule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_categoryId_fkey" FOREIGN KEY ("businessId", "categoryId") REFERENCES "Category" ("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_businessId_productId_fkey" FOREIGN KEY ("businessId", "productId") REFERENCES "Product" ("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_businessId_orderId_fkey" FOREIGN KEY ("businessId", "orderId") REFERENCES "Order" ("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_businessId_productId_fkey" FOREIGN KEY ("businessId", "productId") REFERENCES "Product" ("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_businessId_orderId_fkey" FOREIGN KEY ("businessId", "orderId") REFERENCES "Order" ("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund" ADD CONSTRAINT "Refund_businessId_orderId_fkey" FOREIGN KEY ("businessId", "orderId") REFERENCES "Order" ("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
