CREATE TABLE "RestaurantTable" (
  "id" UUID PRIMARY KEY,
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "RestaurantTable_businessId_id_key" ON "RestaurantTable"("businessId", "id");
CREATE UNIQUE INDEX "RestaurantTable_businessId_name_key" ON "RestaurantTable"("businessId", "name");

CREATE TABLE "KitchenTicket" (
  "id" UUID PRIMARY KEY,
  "businessId" UUID NOT NULL REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tableId" UUID,
  "cashierId" UUID NOT NULL,
  "orderType" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "lines" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KitchenTicket_businessId_tableId_fkey" FOREIGN KEY ("businessId", "tableId") REFERENCES "RestaurantTable"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KitchenTicket_businessId_id_key" ON "KitchenTicket"("businessId", "id");
CREATE INDEX "KitchenTicket_businessId_status_createdAt_idx" ON "KitchenTicket"("businessId", "status", "createdAt");
CREATE UNIQUE INDEX "KitchenTicket_active_table_key" ON "KitchenTicket"("businessId", "tableId")
  WHERE "tableId" IS NOT NULL AND "status" IN ('QUEUED', 'PREPARING', 'READY');

ALTER TABLE "Order" ADD COLUMN "ticketId" UUID;
CREATE UNIQUE INDEX "Order_businessId_ticketId_key" ON "Order"("businessId", "ticketId");
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_ticketId_fkey"
  FOREIGN KEY ("businessId", "ticketId") REFERENCES "KitchenTicket"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EmployeeShift" (
  "id" UUID PRIMARY KEY,
  "businessId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "openingCash" DECIMAL(14,2) NOT NULL,
  "closingCash" DECIMAL(14,2),
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "EmployeeShift_businessId_userId_fkey" FOREIGN KEY ("businessId", "userId") REFERENCES "BusinessMembership"("businessId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "EmployeeShift_businessId_userId_openedAt_idx" ON "EmployeeShift"("businessId", "userId", "openedAt");
CREATE UNIQUE INDEX "EmployeeShift_active_key" ON "EmployeeShift"("businessId", "userId") WHERE "closedAt" IS NULL;
