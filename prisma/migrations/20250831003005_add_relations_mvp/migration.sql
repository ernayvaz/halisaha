-- CreateTable
CREATE TABLE "MVPPoll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MVPPoll_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MVPVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "voterParticipantId" TEXT NOT NULL,
    "targetParticipantId" TEXT NOT NULL,
    CONSTRAINT "MVPVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "MVPPoll" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MVPVote_voterParticipantId_fkey" FOREIGN KEY ("voterParticipantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MVPVote_targetParticipantId_fkey" FOREIGN KEY ("targetParticipantId") REFERENCES "Participant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "count" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MVPPoll_eventId_key" ON "MVPPoll"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MVPVote_pollId_voterParticipantId_key" ON "MVPVote"("pollId", "voterParticipantId");
