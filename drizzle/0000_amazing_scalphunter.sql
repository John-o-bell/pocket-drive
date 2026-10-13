CREATE TABLE `football_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `football_rooms_expiry` ON `football_rooms` (`expires_at`);