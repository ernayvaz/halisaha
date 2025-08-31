-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "date" DATETIME,
    "startTime" TEXT,
    "durationMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "rosterLocked" BOOLEAN NOT NULL DEFAULT false,
    "lineupLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("code", "createdAt", "date", "durationMinutes", "id", "name", "startTime", "status") SELECT "code", "createdAt", "date", "durationMinutes", "id", "name", "startTime", "status" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_code_key" ON "Event"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
