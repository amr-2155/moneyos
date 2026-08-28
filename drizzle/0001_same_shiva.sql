PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transaction_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`from_transaction_id` text,
	`to_transaction_id` text,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`notes` text,
	`reversed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_transaction_transfers`("id", "user_id", "from_transaction_id", "to_transaction_id", "from_account_id", "to_account_id", "amount_minor", "currency", "notes", "reversed_at", "created_at") SELECT "id", "user_id", "from_transaction_id", "to_transaction_id", "from_account_id", "to_account_id", "amount_minor", "currency", "notes", "reversed_at", "created_at" FROM `transaction_transfers`;--> statement-breakpoint
DROP TABLE `transaction_transfers`;--> statement-breakpoint
ALTER TABLE `__new_transaction_transfers` RENAME TO `transaction_transfers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transaction_transfers_user_idx` ON `transaction_transfers` (`user_id`);