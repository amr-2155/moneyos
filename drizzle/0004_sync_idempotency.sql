CREATE TABLE `sync_idempotency_keys` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_idempotency_keys_user_idx` ON `sync_idempotency_keys` (`user_id`);