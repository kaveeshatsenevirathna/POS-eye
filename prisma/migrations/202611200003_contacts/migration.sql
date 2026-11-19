CREATE TABLE "Customer" (
  "id" UUID PRIMARY KEY,
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Customer_businessId_id_key" ON "Customer"("businessId", "id");
CREATE INDEX "Customer_businessId_active_name_idx" ON "Customer"("businessId", "active", "name");

CREATE TABLE "Supplier" (
  "id" UUID PRIMARY KEY,
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "notes" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Supplier_businessId_id_key" ON "Supplier"("businessId", "id");
CREATE INDEX "Supplier_businessId_active_name_idx" ON "Supplier"("businessId", "active", "name");

ALTER TABLE "Order" ADD COLUMN "customerId" UUID, ADD COLUMN "customerName" TEXT;
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_customerId_fkey"
  FOREIGN KEY ("businessId", "customerId") REFERENCES "Customer"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD COLUMN "supplierId" UUID;
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_supplierId_fkey"
  FOREIGN KEY ("businessId", "supplierId") REFERENCES "Supplier"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
