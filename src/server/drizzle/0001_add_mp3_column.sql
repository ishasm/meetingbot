-- Add mp3 column to bots table for storing extracted audio file key
ALTER TABLE "bots" ADD COLUMN "mp3" varchar(255);

