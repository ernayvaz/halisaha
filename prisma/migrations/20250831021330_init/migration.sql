-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "foot" TEXT,
    "pace" INTEGER DEFAULT 1,
    "shoot" INTEGER DEFAULT 1,
    "pass" INTEGER DEFAULT 1,
    "defend" INTEGER DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "date" TIMESTAMP(3),
    "startTime" TEXT,
    "durationMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "rosterLocked" BOOLEAN NOT NULL DEFAULT false,
    "lineupLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Participant" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'player',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MVPPoll" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MVPPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MVPVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "voterParticipantId" TEXT NOT NULL,
    "targetParticipantId" TEXT NOT NULL,

    CONSTRAINT "MVPVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Badge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HistorySnapshot" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ttlAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#16a34a',
    "formation" TEXT NOT NULL DEFAULT '1-2-2-1',

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Assignment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LineupPosition" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LineupPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "public"."User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceToken_key" ON "public"."Device"("deviceToken");

-- CreateIndex
CREATE UNIQUE INDEX "Event_code_key" ON "public"."Event"("code");

-- CreateIndex
CREATE INDEX "Participant_eventId_userId_idx" ON "public"."Participant"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MVPPoll_eventId_key" ON "public"."MVPPoll"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "MVPVote_pollId_voterParticipantId_key" ON "public"."MVPVote"("pollId", "voterParticipantId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_userId_type_key" ON "public"."Badge"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Team_eventId_index_key" ON "public"."Team"("eventId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_teamId_participantId_key" ON "public"."Assignment"("teamId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "LineupPosition_teamId_participantId_key" ON "public"."LineupPosition"("teamId", "participantId");

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Participant" ADD CONSTRAINT "Participant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MVPPoll" ADD CONSTRAINT "MVPPoll_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MVPVote" ADD CONSTRAINT "MVPVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "public"."MVPPoll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MVPVote" ADD CONSTRAINT "MVPVote_voterParticipantId_fkey" FOREIGN KEY ("voterParticipantId") REFERENCES "public"."Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MVPVote" ADD CONSTRAINT "MVPVote_targetParticipantId_fkey" FOREIGN KEY ("targetParticipantId") REFERENCES "public"."Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Badge" ADD CONSTRAINT "Badge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HistorySnapshot" ADD CONSTRAINT "HistorySnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Assignment" ADD CONSTRAINT "Assignment_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "public"."Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineupPosition" ADD CONSTRAINT "LineupPosition_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineupPosition" ADD CONSTRAINT "LineupPosition_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "public"."Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
